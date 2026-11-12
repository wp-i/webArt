import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {ROOT,child} from './collection.mjs';
import {hash} from './production/api.mjs';
import {validateAsset} from './production/assets.mjs';
import {referencePreflight} from './production-flow.mjs';
import {assertReferenceSelection} from './production/references.mjs';

const [configFile,...args]=process.argv.slice(2),runtime=args.find(x=>x.startsWith('--blender='))?.slice(10);
if(!configFile||!runtime)throw Error('Provide a static asset recipe and an explicit local Blender executable.');
const config=JSON.parse(fs.readFileSync(child(ROOT,configFile),'utf8'));
if(config.schemaVersion!==1||config.recipe!=='campo-hand-and-cork-v1')throw Error('Unsupported static asset recipe.');
assertReferenceSelection(ROOT,config.sourceUrl,config.recheck);
referencePreflight(ROOT,config.referenceReview,config.calibrationReview);
const referenced=[config.hand.input,config.cork.input,...Object.values(config.cork.maps)];
if(new Set(config.inputs.map(i=>i.path)).size!==config.inputs.length||referenced.some(file=>!config.inputs.some(i=>i.path===file)))throw Error('Every geometry and material input must have an exact static fingerprint.');
for(const input of config.inputs){const bytes=fs.readFileSync(child(ROOT,input.path));if(hash(bytes)!==input.sha256)throw Error('Asset input changed: '+input.path)}
const outputs=[config.hand.output,config.cork.output];
for(const file of outputs){if(!file.startsWith('assets/candidates/')||!file.endsWith('.glb'))throw Error('Asset preparation writes candidate GLB only.');if(fs.existsSync(child(ROOT,file)))throw Error('Never overwrite prepared assets: '+file);fs.mkdirSync(path.dirname(child(ROOT,file)),{recursive:true})}
const binary=child(ROOT,runtime);if(!fs.existsSync(binary))throw Error('Configured offline converter is unavailable.');
const log=[];const code=await new Promise((resolve,reject)=>{const proc=spawn(binary,['--background','--factory-startup','--python-exit-code','1','--python',child(ROOT,'scripts/assets/prepare-campo.py'),'--',child(ROOT,configFile)],{cwd:ROOT,windowsHide:true,stdio:['ignore','pipe','pipe']});proc.stdout.on('data',data=>log.push(data));proc.stderr.on('data',data=>log.push(data));proc.on('error',reject);proc.on('close',resolve)});
fs.writeFileSync(child(ROOT,config.log),Buffer.concat(log));if(code!==0)throw Error('Offline preparation failed; inspect '+config.log);
const records=outputs.map(file=>{const bytes=fs.readFileSync(child(ROOT,file));return{path:file,sha256:hash(bytes),bytes:bytes.length,...validateAsset(bytes,file)}});
const receipt={schemaVersion:1,recipe:{path:configFile,sha256:hash(fs.readFileSync(child(ROOT,configFile)))},preflight:{referenceReview:config.referenceReview,calibrationReview:config.calibrationReview},converter:{path:runtime,sha256:hash(fs.readFileSync(binary))},scripts:['scripts/prepare-model-assets.mjs','scripts/assets/prepare-campo.py'].map(file=>({path:file,sha256:hash(fs.readFileSync(child(ROOT,file)))})),inputs:config.inputs,outputs:records,visualAdmission:false,limitation:'Deterministic preparation is an engineering result; final render, deformation and replacement review remain required.'};
fs.writeFileSync(child(ROOT,config.receipt),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({result:'prepared-not-visually-approved',outputs:records}));
