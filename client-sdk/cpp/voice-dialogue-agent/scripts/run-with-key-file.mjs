import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
const [keyFile, executable, ...args]=process.argv.slice(2);
if(!keyFile || !executable || !path.isAbsolute(keyFile) || !path.isAbsolute(executable))throw Error('absolute key file and executable required');
const values=[];
for(const line of fs.readFileSync(keyFile,'utf8').split(/\r?\n/)) {
 const match=/^\s*(?:export\s+)?EVA_GATEWAY_API_KEY\s*=\s*(.*?)\s*$/.exec(line);
 if(match){let value=match[1];if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);values.push(value);}
}
if(values.length!==1 || !values[0] || /[\r\n\0]/.test(values[0]))throw Error('exactly one valid EVA_GATEWAY_API_KEY assignment required');
const child=spawn(executable,args,{stdio:['pipe','pipe','pipe'],env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:process.env.HOME,LANG:'en_US.UTF-8'}});
// Redact defensively across child output chunk boundaries.
function forward(stream,target){let buffer='';stream.setEncoding('utf8');stream.on('data',chunk=>{buffer+=chunk;let n;while((n=buffer.indexOf('\n'))!==-1){target.write(buffer.slice(0,n+1).split(values[0]).join('[REDACTED]'));buffer=buffer.slice(n+1);}});stream.on('end',()=>{if(buffer)target.write(buffer.split(values[0]).join('[REDACTED]'));});}
forward(child.stdout,process.stdout);forward(child.stderr,process.stderr);
child.stdin.on('error',()=>{});child.stdin.end(values[0]+'\n');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('error',()=>{console.error('cannot start acceptance executable');process.exitCode=1;});
child.on('exit',(code,signal)=>{process.exitCode=code??1;if(signal)console.error('acceptance terminated by '+signal);});
