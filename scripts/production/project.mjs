import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import {child,fingerprint} from '../collection.mjs';
import {ProductionError,hash} from './api.mjs';
import {command} from './process.mjs';
import {fillContent,contentViteConfig} from './content.mjs';
import {validateAsset} from './assets.mjs';
import {assertRenderingSource} from './rendering.mjs';
import {resolveLockedModules,mergeLockedModules} from './locked-modules.mjs';
const addons=new Set(['three/addons/loaders/GLTFLoader.js','three/addons/controls/OrbitControls.js','three/addons/environments/RoomEnvironment.js']);

const need=(ok,message)=>{if(!ok)throw new ProductionError('invalid-source',message)};
export const fonts=JSON.parse(fs.readFileSync(new URL('../../docs/assets/font-registry.json',import.meta.url),'utf8'));
export function resolveFonts(fontPlan,root){
 need(Array.isArray(fontPlan)&&fontPlan.length>0&&fontPlan.length<=2&&new Set(fontPlan.map(f=>f.id)).size===fontPlan.length,'须预先锁定1–2款字体及其角色');
 return fontPlan.map(choice=>{const font=fonts.find(f=>f.id===choice.id);need(font&&typeof choice.role==='string'&&choice.role.length>=3,'字体不在已验证库存或缺少固定角色');
  if(root){const bytes=fs.readFileSync(child(root,font.source));need(bytes.subarray(0,4).toString()==='wOF2'&&hash(bytes)===font.sha256&&hash(fs.readFileSync(child(root,font.license)))===font.licenseSha256,'字体或许可已改变，须重新核验');}
  return {...font,role:choice.role};
 });
}
export function assertFontSources(files,fontPlan){
 const selected=resolveFonts(fontPlan),allowed=new Set(selected.map(f=>f.file));
 for(const f of files)for(const match of f.content.matchAll(/([a-z0-9_-]+\.(?:woff2?|ttf|otf))/gi))need(allowed.has(match[1]),'源码使用了静态合同之外的字体');
 need(selected.every(font=>files.some(f=>f.content.includes(font.file))),'源码省略已锁定字体');return selected;
}
export function availableAssets(root){
 const records=JSON.parse(fs.readFileSync(child(root,'docs/assets/sourced-media.json'),'utf8'));
 return records.filter(r=>r.verified&&r.localPath&&r.sha256&&/https:\/\/(www\.)?pexels\.com\/license\//.test(r.license)&&fs.existsSync(child(root,r.localPath))&&hash(fs.readFileSync(child(root,r.localPath)))===r.sha256).map((r,i)=>({...r,assetId:'stock-'+i}));
}
export function validateFiles(files){
 need(Array.isArray(files)&&files.length>1&&files.length<=24,'生成源码文件数量异常');const seen=new Set();let size=0;
 for(const f of files){
  need(f&&typeof f.path==='string'&&(f.path==='index.html'||/^src\/[a-z0-9/_-]+\.(?:js|css|svg|glsl)$/.test(f.path))&&!f.path.includes('..')&&!f.path.includes('//'),'生成文件只能在约定的网页源码目录，使用可移植的小写文件名');
  const key=f.path.toLowerCase();need(!seen.has(key),'生成文件重复');seen.add(key);
  need(typeof f.content==='string'&&f.content.length>0,'生成源码为空');size+=Buffer.byteLength(f.content);
  need(!/(?:\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|serviceWorker|document\.cookie|localStorage|sessionStorage|\beval\s*\(|new\s+Function|\bimport\s*\(|node:|https?:\/\/|\.env\b)/i.test(f.content),'模板源码包含未授权的网络、存储或执行入口');
  need(!/(?:file:|[a-z]:[\\/]|(?:\.\.\/){2,}|@import\b)/i.test(f.content),'源码不能读取项目外的文件或引入外部样式');
  if(f.path.endsWith('.js'))for(const m of f.content.matchAll(/(?:import|export)\s+[\s\S]*?\s+from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g)){const target=m[1]??m[2],resolved=path.posix.normalize(path.posix.join(path.posix.dirname(f.path),target.split('?')[0]));need(target==='three'||addons.has(target)||((target.startsWith('./')||target.startsWith('../'))&&resolved.startsWith('src/')),'只允许src模块和已锁定的Three.js本地模型/输入组件')}
 }
 need(seen.has('index.html')&&seen.has('src/main.js')&&seen.has('src/styles.css')&&size<350000,'生成项目缺少入口或超出源码预算');
 const html=files.find(f=>f.path==='index.html').content;
 need(/<meta[^>]+name=["']viewport["']/i.test(html)&&/src=["']\/src\/main\.js["']/i.test(html),'模板必须包含真实手机设置和可编辑源码入口');
 return true;
}
export async function writeProject({root,directory,entry,files,assets,assetPlan,content,requiredContent,fontPlan,rendering,lockedModules=[],coreSignatures=[],signal}){
 files=mergeLockedModules(files,resolveLockedModules(root,lockedModules,rendering,coreSignatures));
 validateFiles(files);assertRenderingSource(files,rendering);const selectedFonts=assertFontSources(files,fontPlan);resolveFonts(fontPlan,root);files=fillContent(files,content,requiredContent);const target=child(root,directory);need(fs.existsSync(path.join(target,'reference-admission.json')),'没有参考前置资格');
 const selected=assetPlan.media.map(x=>{const r=assets.find(a=>a.assetId===x.assetId);need(r,'素材不在已验证的可分发库存');return r});need(new Set(selected.map(r=>r.assetId)).size===selected.length&&selected.length<=6,'素材计划重复或超过限额');
 for(const f of files){const filename=child(root,directory+'/'+f.path);fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,f.content)}
 fs.writeFileSync(path.join(target,'src/content.json'),JSON.stringify(content,null,2)+'\n');
 fs.writeFileSync(path.join(target,'vite.config.js'),contentViteConfig(requiredContent));
 const assetDir=child(root,directory+'/public/assets');fs.mkdirSync(assetDir,{recursive:true});
 for(const r of selected){const bytes=fs.readFileSync(child(root,r.localPath));need(hash(bytes)===r.sha256,'素材在实施前发生变化');const {extension}=validateAsset(bytes,r.localPath);fs.writeFileSync(path.join(assetDir,r.assetId+extension),bytes)}
 const fontNotices=[];
 for(const font of selectedFonts){fs.copyFileSync(child(root,font.source),path.join(assetDir,font.file));fs.copyFileSync(child(root,font.license),path.join(assetDir,font.file+'.OFL.txt'));fontNotices.push(font.name+' ('+font.role+') — SIL Open Font License 1.1; full license: public/assets/'+font.file+'.OFL.txt')}
 need(fs.readdirSync(assetDir).length>0,'模板必须包含实际使用的可分发媒体或字体');
 // Dependency scripts/configuration are owned by the driver, never by model output.
 const usesThree=files.some(f=>/from\s*['"]three(?:\/addons\/[^'"]+)?['"]/.test(f.content));
 const pkg={name:'webart-'+entry.slug,version:'0.3.0',private:true,type:'module',scripts:{dev:'vite --host 127.0.0.1',build:'vite build',preview:'vite preview --host 127.0.0.1'},...(usesThree?{dependencies:{three:'0.186.1'}}:{}),devDependencies:{vite:'8.2.2'}};
 fs.writeFileSync(path.join(target,'package.json'),JSON.stringify(pkg,null,2)+'\n');
 fs.writeFileSync(path.join(target,'README.md'),`# ${entry.title}\n\n安装：npm ci\n预览：npm run dev\n构建：npm run build\n\n修改 src/content.json 即可更新固定文案；Vite自动同步默认HTML，无脚本仍可读取。布局与交互编辑 src/main.js、src/styles.css，素材在 public/assets。联系链接按实际用途替换；默认页面、触摸、键盘和减少动态均应完整可用。\n`);
 fs.writeFileSync(path.join(target,'LICENSE.md'),'WebArt private review source. Public or commercial release requires the project release policy. Third-party media retains its original license.\n');
 fs.writeFileSync(path.join(target,'THIRD_PARTY_NOTICES.md'),selected.map(r=>`${r.assetId}${path.extname(r.localPath).toLowerCase()} — ${r.creator}\nSource: ${r.source}\nLicense: ${r.license}\nVerified: ${r.verified}\nDistribution basis: ${r.distributionBasis??'Part of a complete licensed website template'}\nSHA256: ${r.sha256}\n`).join('\n')+'\n'+fontNotices.join('\n')+'\n'+lockedModules.map(m=>`${m.target} — ${m.creator}\nSource: ${m.sourceDescription}\nLicense: ${m.license}\nVerified: ${m.verified}\nDistribution basis: ${m.distributionBasis}\nSHA256: ${m.sha256}\n`).join('\n')+'\nVite: MIT; Three.js, when used: MIT. Dependencies retain their own licenses.\n');
 await command(process.env.WEBART_POWERSHELL??'pwsh.exe',['-NoProfile','-Command','& npm.cmd install --ignore-scripts --no-audit --no-fund; if ($LASTEXITCODE -ne 0) {exit $LASTEXITCODE}'],{cwd:target,signal,timeout:180000});
 await buildProject({root,directory,signal});
 const manifest={slug:entry.slug,version:pkg.version,output:`public/${entry.slug}-source.zip`,files:['index.html','package.json','package-lock.json','vite.config.js','src','public/assets','README.md','LICENSE.md','THIRD_PARTY_NOTICES.md'].map(archive=>({source:directory+'/'+archive,archive}))};
 fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');return {manifest:directory+'/manifest.json',sourceSha256:fingerprint({...entry,manifest:directory+'/manifest.json'},root)};
}
export async function replaceFiles({root,directory,files,content,requiredContent,fontPlan,rendering,lockedModules=[],coreSignatures=[],signal}){
 files=mergeLockedModules(files,resolveLockedModules(root,lockedModules,rendering,coreSignatures));
 validateFiles(files);assertRenderingSource(files,rendering);assertFontSources(files,fontPlan);files=fillContent(files,content,requiredContent);const current=fs.readdirSync(child(root,directory+'/src'),{recursive:true});
 // Never silently retain abandoned visible components from a revised file set.
 for(const name of current){const rel='src/'+name.replaceAll('\\','/'),filename=child(root,directory+'/'+rel);if(rel!=='src/content.json'&&fs.statSync(filename).isFile()&&!files.some(f=>f.path===rel))fs.unlinkSync(filename)}
 for(const f of files){const filename=child(root,directory+'/'+f.path);fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,f.content)}
 await buildProject({root,directory,signal});
}
export async function buildProject({root,directory,signal}){return command(process.execPath,[path.join(child(root,directory),'node_modules/vite/bin/vite.js'),'build','--base=./'],{cwd:child(root,directory),signal,timeout:60000})}
export function storeTrialArchive({root,temporary,archivePath,expectedSha256}){
 need(path.dirname(path.resolve(temporary))===path.resolve(os.tmpdir())&&path.basename(temporary).startsWith('webart-')&&temporary.endsWith('.zip'),'归档只从本轮系统临时文件转移');
 need(/^\.webart\/trials\/api-[a-z0-9-]+-source\.zip$/.test(archivePath),'新归档必须留在私有试产目录');
 const stat=fs.lstatSync(temporary);need(stat.isFile()&&!stat.isSymbolicLink(),'临时归档必须是实际文件');const bytes=fs.readFileSync(temporary);need(hash(bytes)===expectedSha256,'归档转移前字节已改变');
 const destination=child(root,archivePath);fs.mkdirSync(path.dirname(destination),{recursive:true});
 // Copy+verify+unlink also works when the system temp drive differs from the project.
 // Exclusive creation protects an existing delivery from an accidental overwrite.
 fs.copyFileSync(temporary,destination,fs.constants.COPYFILE_EXCL);
 try{need(hash(fs.readFileSync(destination))===expectedSha256,'跨盘归档复制不完整')}catch(error){fs.unlinkSync(destination);throw error}
 fs.unlinkSync(temporary);return {bytes:bytes.length,sha256:expectedSha256};
}
export const mime=filename=>({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.woff2':'font/woff2','.mp4':'video/mp4','.glb':'model/gltf-binary','.zip':'application/zip'})[path.extname(filename)]??'application/octet-stream';
export function serveDirectory(directory){
 const server=http.createServer((request,response)=>{
  try{const relative=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname).replace(/^\/+/, '')||'index.html',filename=child(directory,relative);
   if(!fs.statSync(filename).isFile())throw Error('Missing');response.writeHead(200,{'Content-Type':mime(filename),'Content-Security-Policy':"default-src 'self' data: blob:; connect-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-src 'none'; object-src 'none'",'Cache-Control':'no-store'});fs.createReadStream(filename).pipe(response);
  }catch{response.writeHead(404);response.end('Not found')}
 });return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve({server,url:'http://127.0.0.1:'+server.address().port+'/'})));
}
export async function verifyDelivery(root,directory,previewUrl,archivePath){
 const dist=child(root,directory+'/dist');
 for(const relative of fs.readdirSync(dist,{recursive:true})){const filename=child(dist,relative.replaceAll('\\','/'));if(!fs.statSync(filename).isFile())continue;const response=await fetch(new URL(relative.replaceAll('\\','/').split('/').map(encodeURIComponent).join('/'),previewUrl),{signal:AbortSignal.timeout(15000)});if(!response.ok||hash(Buffer.from(await response.arrayBuffer()))!==hash(fs.readFileSync(filename)))throw new ProductionError('delivery-http','预览或素材的实际HTTP字节不一致')}
 const server=await serveDirectory(path.dirname(child(root,archivePath)));
 try{const response=await fetch(server.url+path.basename(archivePath),{signal:AbortSignal.timeout(15000)}),bytes=Buffer.from(await response.arrayBuffer());if(response.status!==200||!response.headers.get('content-type')?.includes('application/zip')||hash(bytes)!==hash(fs.readFileSync(child(root,archivePath))))throw new ProductionError('delivery-http','唯一源码包的HTTP下载核验失败')}finally{await new Promise(resolve=>server.server.close(resolve))}
 return {previewAndAllAssets:'passed',archiveHttp:'passed'};
}
