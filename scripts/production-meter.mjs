import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Local Codex usage only. No API credentials or conversation content are read into the report.
const [run,stage,...options]=process.argv.slice(2);
if(!/^[a-z0-9-]+$/.test(run??'')||!/^[a-z0-9-]+$/.test(stage??''))throw new Error('Provide a run and stage');
function option(name,fallback){const index=options.indexOf(name);if(index<0)return fallback;if(!options[index+1])throw new Error('Missing '+name);return options[index+1]}
const sessions=path.join(os.homedir(),'.codex','sessions');
const thread=process.env.CODEX_THREAD_ID;
function findSession(directory){for(const item of fs.readdirSync(directory,{withFileTypes:true})){const p=path.join(directory,item.name);if(item.isDirectory()){const found=findSession(p);if(found)return found}else if(thread&&item.name.endsWith(`-${thread}.jsonl`))return p}}
const source=option('--session',thread?findSession(sessions):null);
if(!source||!fs.statSync(source).isFile())throw new Error('Provide --session with the current local Codex rollout');
let usage=null,usageAt=null;
for(const line of fs.readFileSync(source,'utf8').split('\n')){let e;try{e=JSON.parse(line)}catch{continue}if(e.type==='event_msg'&&e.payload.type==='token_count'&&e.payload.info){usage=e.payload.info.total_token_usage;usageAt=e.timestamp}}
if(!usage)throw new Error('No local metering record');
const dir=path.resolve('.webart/metrics');fs.mkdirSync(dir,{recursive:true});
const file=path.resolve(option('--ledger',path.join(dir,'trial-006-008.jsonl')));
if(!file.startsWith(dir+path.sep)||!file.endsWith('.jsonl'))throw new Error('Ledger must be a private .webart/metrics/*.jsonl file');
const record={at:new Date().toISOString(),run,stage,usageAt,usage};
fs.appendFileSync(file,JSON.stringify(record)+'\n');console.log(JSON.stringify({run,stage,at:record.at}));
