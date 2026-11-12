import fs from 'node:fs';
import crypto from 'node:crypto';

export class ProductionError extends Error {
 constructor(code,message,details={}){super(message);this.name='ProductionError';this.code=code;this.details=details;}
}
export const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export function imageInput(filename,label){
 const bytes=fs.readFileSync(filename),png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpeg=bytes[0]===255&&bytes[1]===216,webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if(!png&&!jpeg&&!webp)throw new ProductionError('invalid-image','视觉输入必须是实际图片');
 const image={type:'input_image',image_url:`data:image/${png?'png':jpeg?'jpeg':'webp'};base64,${bytes.toString('base64')}`,detail:'high'};
 Object.defineProperty(image,'evidence',{value:{path:filename,sha256:hash(bytes)},enumerable:false});
 return [{type:'input_text',text:label},image];
}
export function responseText(response){
 if(response.status!=='completed')throw new ProductionError('incomplete-response','模型回答未完成，当前阶段没有通过');
 const parts=(response.output??[]).flatMap(x=>x.content??[]);
 if(parts.some(p=>p.type==='refusal'))throw new ProductionError('model-refusal','模型没有执行本阶段任务');
 const text=parts.filter(p=>p.type==='output_text').map(p=>p.text).join('');
 if(!text)throw new ProductionError('empty-response','模型未返回可验证的结果');
 return text;
}
export class ResponsesClient {
 constructor({apiKey,model,fetchImpl=fetch,onUsage=()=>{},signal,maxRequests=32}){
  if(!apiKey||!model)throw new ProductionError('configuration-required','请在本地配置 API Key 和支持图像输入的模型');
  this.apiKey=apiKey;this.model=model;this.fetch=fetchImpl;this.onUsage=onUsage;this.signal=signal;this.maxRequests=maxRequests;this.requests=0;
 }
 async json({role,instructions,text,images=[],schema,search=false,maxOutputTokens=8000}){
  if(search)throw new ProductionError('static-plan-required','正式流程不允许模型自主搜索或扩展工具调用');
  if(this.signal?.aborted)throw new ProductionError('request-interrupted','本轮已停止，未发起新的模型请求');
  if(++this.requests>this.maxRequests)throw new ProductionError('request-budget','本次调用预算已到，未降低质量标准');
  const body={model:this.model,store:false,instructions,input:[{role:'user',content:[{type:'input_text',text},...images]}],text:{format:{type:'json_schema',name:'webart_'+role.replaceAll('-','_'),strict:true,schema}},max_output_tokens:maxOutputTokens,...(search?{tools:[{type:'web_search'}]}:{})};
  const signal=AbortSignal.any([AbortSignal.timeout(180000),...(this.signal?[this.signal]:[])]);
  let response;
  try{response=await this.fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+this.apiKey,'Content-Type':'application/json'},body:JSON.stringify(body),signal})}catch(error){throw new ProductionError(signal.aborted?'request-interrupted':'network-error','模型连接中断，当前阶段未完成')}
  if(!response.ok)throw new ProductionError('api-'+response.status,response.status===401?'API Key 验证失败':response.status===429?'模型服务达到当前用量限制':'模型请求失败，当前阶段未通过');
  const data=await response.json();
  this.onUsage({role,responseId:data.id??null,model:data.model??this.model,usage:data.usage??null,at:new Date().toISOString()});
  let value;try{value=JSON.parse(responseText(data))}catch(error){if(error instanceof ProductionError)throw error;throw new ProductionError('invalid-json','模型结果不是完整的结构化数据')}
  return value;
 }
}
