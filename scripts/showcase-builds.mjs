import fs from 'node:fs';
import path from 'node:path';
import {child} from './collection.mjs';
import {hash} from './production/api.mjs';
import {loadRenderer} from './production/renderers.mjs';
import {mime} from './production/project.mjs';

export function verifyPreparedBuild(renderer, root) {
  const directory=child(root,renderer.definition.sourceDirectory+'/dist');
  const marker=JSON.parse(fs.readFileSync(path.join(directory,'webart-preview.json'),'utf8'));
  if(marker.rendererId!==renderer.definition.id||marker.sourceSha256!==renderer.definition.sourceSha256||marker.archiveSha256!==renderer.archive.sha256||!marker.buildFiles?.some(f=>f.path==='index.html')) throw Error('Prepare the qualified renderer build before serving');
  const seen=new Set();
  for(const file of marker.buildFiles){
    if(seen.has(file.path)||file.path.endsWith('.zip')||hash(fs.readFileSync(child(directory,file.path)))!==file.sha256)throw Error('Prepared renderer build changed');
    seen.add(file.path);
  }
  return {directory,marker,files:new Set([...seen,'webart-preview.json'])};
}
export function showcaseBuilds(root,items){
  return items.filter(i=>i.rendererId).map(item=>({prefix:item.preview,...verifyPreparedBuild(loadRenderer(root,item.rendererId),root)}));
}
export function serveShowcaseBuilds(builds){
  return (request,response,next)=>{
    const pathname=new URL(request.url,'http://localhost').pathname;
    const build=builds.find(b=>pathname.startsWith(b.prefix));
    if(!build)return next();
    let file;try{file=decodeURIComponent(pathname.slice(build.prefix.length))||'index.html';if(!build.files.has(file))throw Error('Missing');
      const bytes=fs.readFileSync(child(build.directory,file));
      const pin=build.marker.buildFiles.find(f=>f.path===file);
      if(pin&&hash(bytes)!==pin.sha256)throw Error('Changed');
      response.writeHead(200,{'Content-Type':mime(file),'Cache-Control':'no-store'});response.end(bytes);
    }catch{response.writeHead(404);response.end('Preview file unavailable')}
  };
}
export function copyShowcaseBuilds(root,items){
  for(const build of showcaseBuilds(root,items))for(const file of build.files){
    const destination=child(root,'dist/'+build.prefix.slice(1)+file);
    fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(child(build.directory,file),destination);
  }
}
