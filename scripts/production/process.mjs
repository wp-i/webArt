import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {ProductionError} from './api.mjs';
import {checkTaskBrowser} from './browser-health.mjs';
export function command(file,args,{cwd,signal,timeout=180000}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(file,args,{cwd,windowsHide:true,stdio:['ignore','pipe','pipe'],signal});let output='',done=false;
  const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(output)};
  const kill=()=>{if(process.platform==='win32'&&child.pid)spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}).on('error',()=>child.kill());else child.kill()};
  const timer=setTimeout(()=>{kill();finish(new ProductionError('stage-timeout','当前阶段超时，没有记为通过'))},timeout);
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output=(output+chunk.toString()).slice(-16000)});
  child.on('error',()=>{kill();finish(new ProductionError(signal?.aborted?'cancelled':'process-unavailable',signal?.aborted?'本轮已停止':'本地执行环境不可用'))});
  child.on('close',code=>finish(code===0?null:new ProductionError('stage-failed','本地检查失败',{output})));
 });
}
export async function browserEndpoint({root,signal,run=command,env=process.env,health=checkTaskBrowser}={}){
 if(env.WEBART_BROWSER_ENDPOINT){if(!/^ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\//.test(env.WEBART_BROWSER_ENDPOINT))throw new ProductionError('browser-configuration','任务浏览器端点无效');return env.WEBART_BROWSER_ENDPOINT}
 if(process.platform!=='win32')throw new ProductionError('browser-configuration','此仓库入口当前使用 Windows 任务浏览器');
 const shell=env.WEBART_POWERSHELL??path.join(env.SystemRoot??'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
 const browserFile=root?path.join(root,'webart.browser.json'):null;
 const browser=browserFile&&fs.existsSync(browserFile)?JSON.parse(fs.readFileSync(browserFile,'utf8')):null;
 if(browser&&(browser.schemaVersion!==1||browser.headed!==false||typeof browser.executable!=='string'||!path.isAbsolute(browser.executable)||!fs.existsSync(browser.executable)||!Array.isArray(browser.args)||!browser.args.every(a=>/^--[a-z0-9-]+(?:=[a-zA-Z0-9,-]+)?$/.test(a))))throw new ProductionError('browser-configuration','已验证任务浏览器配置不可用，不能静默切回未验证环境');
 const session=env.WEBART_BROWSER_SESSION??browser?.session??'webart-production';
 if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(session))throw new ProductionError('browser-configuration','任务浏览器会话名称无效');
 // Ask the task browser itself; scanning OS processes could select a stale or
 // unrelated profile and required repeated manual port repairs after resume.
 const quote=value=>"'"+value.replaceAll("'","''")+"'";
 const launch=browser?' --headed false --executable-path '+quote(browser.executable)+' --args '+quote(browser.args.join(',')):'';
 const find=async()=>{const output=await run(shell,['-NoProfile','-Command',`& agent-browser --session ${session}${launch} get cdp-url; if ($LASTEXITCODE -ne 0) {exit $LASTEXITCODE}`],{cwd:root,signal,timeout:15000});const values=output.split(/\r?\n/).map(s=>s.trim()).filter(s=>/^ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(s));if(values.length!==1)throw new ProductionError('browser-configuration','任务浏览器端点无效');return values[0]};
 let value;try{value=await find()}catch{
  await run(shell,['-NoProfile','-Command',`& agent-browser --session ${session}${launch} open about:blank; if ($LASTEXITCODE -ne 0) {exit $LASTEXITCODE}`],{cwd:root,signal,timeout:45000});value=await find();
 }
 const endpoint=value.trim();if(!/^ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\//.test(endpoint))throw new ProductionError('browser-configuration','任务浏览器端点无效');if(browser)await health({root,endpoint,configuration:browser});return endpoint;
}
export function captureProcessBudget(cfg){
 const remote=new URL(cfg.url).protocol==='https:'&&!cfg.manifest,limit=remote?240000:120000,budget=cfg.deadlineMs??120000;
 if(!Number.isInteger(budget)||budget<10000||budget>limit)throw new ProductionError('capture-configuration','采证预算超出参考/候选固定上限');
 return budget+15000;
}
export async function runCapture({root,endpoint,cfg,filename,signal}){
 const timeout=captureProcessBudget(cfg);
 fs.writeFileSync(path.resolve(root,filename),JSON.stringify(cfg,null,2));
 await command(process.execPath,[path.join(root,'scripts/capture-production.mjs'),endpoint,filename],{cwd:root,signal,timeout});
 const report=JSON.parse(fs.readFileSync(path.resolve(root,cfg.output,'capture.json'),'utf8'));
 if(report.result!=='captured-not-scored')throw new ProductionError('capture-failed','真实画面采集没有完成');return report;
}
