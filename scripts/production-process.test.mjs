import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {browserEndpoint} from './production/process.mjs';

test('task browser resolves through the named CLI session without scanning unrelated profiles',async()=>{
 const calls=[],endpoint='ws://127.0.0.1:1234/devtools/browser/fixture';
 const run=async(file,args)=>{calls.push({file,args});return endpoint+'\n'};
 assert.equal(await browserEndpoint({env:{WEBART_BROWSER_SESSION:'webart-test',WEBART_POWERSHELL:'pwsh.exe'},run}),endpoint);
 assert.equal(calls.length,1);assert.match(calls[0].args.at(-1),/--session webart-test get cdp-url/);assert.ok(!JSON.stringify(calls).includes('Get-CimInstance'));
});

test('an unavailable session is started once and its current endpoint is queried again',async()=>{
 const calls=[],endpoint='ws://127.0.0.1:1234/devtools/browser/new';
 const run=async(file,args)=>{calls.push(args.at(-1));if(calls.length===1)throw Error('No session');return calls.length===2?'about:blank':endpoint};
 assert.equal(await browserEndpoint({env:{WEBART_POWERSHELL:'pwsh.exe'},run}),endpoint);
 assert.equal(calls.length,3);assert.match(calls[1],/--session webart-production open about:blank/);assert.match(calls[2],/get cdp-url/);
});

test('browser session names and explicit endpoints cannot introduce shell fragments or remote targets',async()=>{
 const run=async()=>assert.fail('Unsafe browser configuration reached shell');
 for(const session of ['x;Get-Content secret','../other','x y','$(test)'])await assert.rejects(browserEndpoint({env:{WEBART_BROWSER_SESSION:session},run}));
 for(const endpoint of ['ws://example.org:123/devtools/browser/test','http://127.0.0.1:123/'])await assert.rejects(browserEndpoint({env:{WEBART_BROWSER_ENDPOINT:endpoint},run}));
});

test('validated browser configuration pins the engine and safely quotes a local executable path',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'webart-browser-config-'));
 t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());assert.match(path.basename(root),/^webart-browser-config-/);fs.rmSync(root,{recursive:true,force:true})});
 const executable=path.join(root,"Browser 'test'.exe");fs.writeFileSync(executable,'fixture');
 fs.writeFileSync(path.join(root,'webart.browser.json'),JSON.stringify({schemaVersion:1,session:'fixed-engine',headed:false,executable,args:['--disable-backgrounding-occluded-windows']}));
 let command;const endpoint='ws://127.0.0.1:1234/devtools/browser/configured';
 assert.equal(await browserEndpoint({root,env:{WEBART_POWERSHELL:'pwsh.exe'},health:async()=>{},run:async(_,args)=>{command=args.at(-1);return 'Existing daemon launch options are unchanged.\n'+endpoint}}),endpoint);
 assert.ok(command.includes("Browser ''test''.exe'"));assert.match(command,/--headed false/);assert.match(command,/--session fixed-engine/);
 fs.unlinkSync(executable);await assert.rejects(browserEndpoint({root,env:{},run:async()=>assert.fail('Missing verified executable must fail before launch')}),/不能静默切回/);
});
