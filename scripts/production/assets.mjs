import path from 'node:path';
import {ProductionError} from './api.mjs';
const need=(ok,message)=>{if(!ok)throw new ProductionError('invalid-asset',message)};
export function validateAsset(bytes,filename){
 const extension=path.extname(filename).toLowerCase();need(bytes.length>0&&bytes.length<=16*1024*1024,'单素材为空或超过已设包体上限');
 if(extension==='.glb'){
  need(bytes.length>=20&&bytes.toString('ascii',0,4)==='glTF'&&bytes.readUInt32LE(4)===2&&bytes.readUInt32LE(8)===bytes.length,'GLB文件签名/版本/长度不匹配');
  const length=bytes.readUInt32LE(12);need(bytes.readUInt32LE(16)===0x4e4f534a&&length%4===0&&20+length<=bytes.length,'GLB缺少实际JSON数据');
  let document;try{document=JSON.parse(bytes.toString('utf8',20,20+length).trim())}catch{throw new ProductionError('invalid-asset','GLB结构数据损坏')}
  need(document.asset?.version==='2.0','只支持已核验的glTF2.0');
  for(const resource of [...(document.buffers??[]),...(document.images??[])])need(!resource.uri||/^data:(?:image\/(?:png|jpeg|webp)|application\/octet-stream);base64,/i.test(resource.uri),'GLB必须自包含，不能引入未锁定外部资源');
  const unsupported=['KHR_draco_mesh_compression','KHR_meshopt_compression','EXT_meshopt_compression','KHR_texture_basisu'];need(![...(document.extensionsRequired??[]),...(document.extensionsUsed??[])].some(x=>unsupported.includes(x)),'模型依赖尚未配置的解码器，不能静默降级');
  return {extension,kind:'self-contained-local-model'};
 }
 const valid=(extension==='.webp'&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')||(extension==='.png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))||(['.jpg','.jpeg'].includes(extension)&&bytes[0]===255&&bytes[1]===216)||(extension==='.mp4'&&bytes.toString('ascii',4,8)==='ftyp');
 need(valid,'普通媒体扩展名与实际文件类型不匹配');return {extension,kind:'local-media'};
}
