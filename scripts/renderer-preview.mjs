import fs from 'node:fs';import path from 'node:path';
import {ROOT,child,fingerprint,receipt} from './collection.mjs';
import {loadRenderer,existingRendererArchive,assertRendererPlan} from './production/renderers.mjs';
import {loadPlan} from './production/runner.mjs';
import {command} from './production/process.mjs';
import {buildProject} from './production/project.mjs';
import {hash} from './production/api.mjs';
import {verifyPreparedBuild} from './showcase-builds.mjs';
import {getShowcase} from './showcase.mjs';
const id=process.argv[2];if(!id)throw Error('Select a registered renderer');
const renderer=loadRenderer(ROOT,id),plan=loadPlan(ROOT,renderer.definition.templateId);if(plan.renderer.id!==id)throw Error('Preview must use the currently selected qualified renderer');assertRendererPlan(ROOT,plan);
const directory=renderer.definition.sourceDirectory,cwd=child(ROOT,directory),marker=path.join(cwd,'dist/webart-preview.json');
let archive;
if(fs.existsSync(child(ROOT,renderer.archive.archivePath)))archive=existingRendererArchive({root:ROOT,plan,sourceSha256:renderer.definition.sourceSha256});
else{
 const shown=getShowcase().find(item=>item.rendererId===id&&item.sourceSha256===renderer.definition.sourceSha256);
 if(!shown)throw Error('Restore the registered archive or its explicitly published identical copy');
 const publicPath='public/'+renderer.entry.slug+'-source.zip';receipt({...renderer.entry,release:renderer.archive},child(ROOT,publicPath));archive={...renderer.archive,archivePath:publicPath};
}
let built=false;try{verifyPreparedBuild(renderer,ROOT);built=true}catch{}
if(!built){
 if(!fs.existsSync(path.join(cwd,'node_modules/vite/bin/vite.js')))await command(process.env.WEBART_POWERSHELL??'pwsh.exe',['-NoProfile','-Command','& npm.cmd ci --ignore-scripts --no-audit --no-fund; if ($LASTEXITCODE -ne 0) {exit $LASTEXITCODE}'],{cwd,timeout:180000});
 await buildProject({root:ROOT,directory});
}
if(fingerprint(renderer.entry,ROOT)!==renderer.definition.sourceSha256)throw Error('Preview build changed approved source');
fs.copyFileSync(child(ROOT,archive.archivePath),path.join(cwd,'dist',renderer.config.slug+'-source.zip'));
const buildFiles=fs.readdirSync(path.join(cwd,'dist'),{recursive:true}).map(p=>p.replaceAll('\\','/')).filter(p=>p!=='webart-preview.json'&&!p.endsWith('.zip')&&fs.statSync(path.join(cwd,'dist',p)).isFile()).sort().map(p=>({path:p,sha256:hash(fs.readFileSync(path.join(cwd,'dist',p)))}));
fs.writeFileSync(marker,JSON.stringify({rendererId:id,sourceSha256:renderer.definition.sourceSha256,archiveSha256:archive.sha256,buildFiles},null,2)+'\n');
console.log(JSON.stringify({result:'qualified-preview-prepared',directory,sourceSha256:renderer.definition.sourceSha256,newArchives:0}));
