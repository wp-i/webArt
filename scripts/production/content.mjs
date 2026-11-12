import {ProductionError} from './api.mjs';
const need=(ok,message)=>{if(!ok)throw new ProductionError('static-content-invalid',message)};
export function validateContent(content,required){
 need(content&&typeof content==='object'&&!Array.isArray(content),'必须预先配置固定展示文案');
 const keys=Object.keys(content);need(keys.length>0&&keys.length<=40&&keys.every(key=>/^[a-z][a-z0-9-]{0,50}$/.test(key)),'文案配置键无效');
 need(Object.values(content).every(value=>typeof value==='string'&&value.length>0&&value.length<=200),'文案值必须是短文本');
 need(Array.isArray(required)&&required.length>0&&new Set(required).size===required.length&&required.every(key=>Object.hasOwn(content,key)),'必须列出默认页面必要的固定文案');return true;
}
const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export function fillContent(files,content,required){
 validateContent(content,required);const found=new Set();
 const result=files.map(file=>{
  if(file.path!=='index.html')return file;
  const filled=file.content.replace(/<([a-z][a-z0-9-]*)([^>]*\bdata-content\s*=\s*(["'])([a-z][a-z0-9-]*)\3[^>]*)>([\s\S]*?)<\/\1\s*>/gi,(_,tag,attributes,quote,key,inside)=>{
   need(Object.hasOwn(content,key),'模型使用了未配置的文案键：'+key);need(!inside.includes('<'),'固定文案槽须是纯文本；动态字形拆分在运行时实施');found.add(key);return `<${tag}${attributes}>${escape(content[key])}</${tag}>`;
  });return {...file,content:filled};
 });
 need(required.every(key=>found.has(key)),'模型遗漏了必需的固定文案槽');return result;
}
// Driver-owned Vite hook keeps config-only edits reflected in dev and build,
// including the default HTML when JavaScript is disabled.
export function contentViteConfig(required){
 return `import fs from 'node:fs';
export default {plugins:[{name:'webart-static-content',transformIndexHtml(html){
 const content=JSON.parse(fs.readFileSync(new URL('./src/content.json',import.meta.url),'utf8'));
 const required=${JSON.stringify(required)},found=new Set();
 const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
 const result=html.replace(/<([a-z][a-z0-9-]*)([^>]*\\bdata-content\\s*=\\s*(["'])([a-z][a-z0-9-]*)\\3[^>]*)>([\\s\\S]*?)<\\/\\1\\s*>/gi,(_,tag,attributes,quote,key,inside)=>{
  if(!Object.hasOwn(content,key)||typeof content[key]!=='string'||inside.includes('<'))throw Error('Invalid static content slot: '+key);
  found.add(key);return '<'+tag+attributes+'>'+escape(content[key])+'</'+tag+'>';
 });
 if(required.some(key=>!found.has(key)))throw Error('Required static content is missing');return result;
}}]};\n`;
}
