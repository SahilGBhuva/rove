import fs from 'node:fs';
import path from 'node:path';
import { assertNoSecret, stripZipTrailer } from '../lib/zip-trailer.mjs';

const [operator, outputArg] = process.argv.slice(2);
const key = process.env.SF_511_API_KEY?.trim();
if(!operator||!outputArg)throw new Error('Usage: fetch-511-static.mjs <operator> <output.zip>');
if(!key)throw new Error('SF_511_API_KEY is not configured');
const output=path.resolve(outputArg),temp=`${output}.download`;
const url=new URL('https://api.511.org/transit/datafeeds');
url.searchParams.set('operator_id',operator);
url.searchParams.set('api_key',key);
const response=await fetch(url,{headers:{Accept:'application/zip','User-Agent':'Rove-static-refresh/0.3'},signal:AbortSignal.timeout(60_000)});
if(!response.ok)throw new Error(`511 static feed ${operator} returned ${response.status}`);
fs.mkdirSync(path.dirname(output),{recursive:true});
// 511 appends an HTML page that repeats the request URL (with the key) after the zip; drop it, and never save the key.
const { buffer, removedBytes } = stripZipTrailer(Buffer.from(await response.arrayBuffer()));
assertNoSecret(buffer, key, `511 static feed ${operator}`);
fs.writeFileSync(temp,buffer,{mode:0o600});
if (removedBytes) console.log(`Removed ${removedBytes} bytes that 511 appended after the zip.`);
fs.renameSync(temp,output);
console.log(`Downloaded 511 static feed for ${operator}.`);
