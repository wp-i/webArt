import path from 'node:path';
import {ROOT} from './collection.mjs';
import {getShowcase} from './showcase.mjs';
import {command} from './production/process.mjs';
for(const item of getShowcase().filter(i=>i.rendererId))await command(process.execPath,[path.join(ROOT,'scripts/renderer-preview.mjs'),item.rendererId],{cwd:ROOT,timeout:240000});
console.log('Qualified showcase builds prepared.');
