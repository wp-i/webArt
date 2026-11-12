import fs from 'node:fs';
export default {plugins:[{name:'webart-static-content',transformIndexHtml(html){
 const content=JSON.parse(fs.readFileSync(new URL('./src/content.json',import.meta.url),'utf8'));
 const required=["brand","study-label","explore-label","hero-title","hero-note","mechanism-title","mechanism-note","matrix-title","matrix-note","spring-title","spring-note","release-label","back-label","drag-label","scroll-label","count-1"],found=new Set();
 const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
 const result=html.replace(/<([a-z][a-z0-9-]*)([^>]*\bdata-content\s*=\s*(["'])([a-z][a-z0-9-]*)\3[^>]*)>([\s\S]*?)<\/\1\s*>/gi,(_,tag,attributes,quote,key,inside)=>{
  if(!Object.hasOwn(content,key)||typeof content[key]!=='string'||inside.includes('<'))throw Error('Invalid static content slot: '+key);
  found.add(key);return '<'+tag+attributes+'>'+escape(content[key])+'</'+tag+'>';
 });
 if(required.some(key=>!found.has(key)))throw Error('Required static content is missing');return result;
}}]};
