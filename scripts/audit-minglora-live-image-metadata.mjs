import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_DIR = path.join(ROOT, "reports");
const JSON_OUTPUT = path.join(REPORT_DIR, "live-image-metadata-audit.json");
const MARKDOWN_OUTPUT = path.join(REPORT_DIR, "live-image-metadata-audit.md");
const SCAN_ROOTS = Object.freeze([
  "assets/reference", "assets/Gifts", "assets/Guests Layout",
  "assets/Gifters Badge Levels", "assets/League", "assets/Artwork"
]);
const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const UNSUPPORTED_IMAGE_EXTENSIONS = new Set([".apng", ".avif", ".bmp", ".heic", ".heif", ".tif", ".tiff"]);

function fail(message) {
  throw new Error("[Minglora LIVE image metadata audit] " + message);
}
function dimensions(width, height, format) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || width > 200000 || height > 200000) {
    fail("invalid or unreasonable image dimensions in " + format + " data.");
  }
  return {
    width_px: width,
    height_px: height,
    aspect_ratio: Number((width / height).toFixed(6)),
    orientation: width === height ? "square" : width > height ? "landscape" : "portrait"
  };
}
function parsePng(buffer) {
  const signature = Buffer.from([137,80,78,71,13,10,26,10]);
  if (buffer.length < 33 || !buffer.subarray(0,8).equals(signature)) fail("invalid or truncated PNG header.");
  let offset=8, dim=null, bitDepth=null, colorType=null, transparency=false, animated=false, end=false;
  while (offset+12<=buffer.length) {
    const length=buffer.readUInt32BE(offset), type=buffer.toString("ascii",offset+4,offset+8);
    const start=offset+8, dataEnd=start+length, chunkEnd=dataEnd+4;
    if(dataEnd>buffer.length||chunkEnd>buffer.length) fail("truncated PNG "+type+" chunk.");
    if(type==="IHDR"){
      if(dim||length!==13) fail("invalid PNG IHDR chunk.");
      dim=dimensions(buffer.readUInt32BE(start),buffer.readUInt32BE(start+4),"PNG");
      bitDepth=buffer[start+8]; colorType=buffer[start+9];
    } else if(type==="tRNS") transparency=true;
    else if(type==="acTL") animated=true;
    else if(type==="IEND"){ if(length!==0) fail("invalid PNG IEND chunk."); end=true; break; }
    offset=chunkEnd;
  }
  if(!dim||!end) fail("PNG is missing IHDR or IEND.");
  if(![0,2,3,4,6].includes(colorType)||![1,2,4,8,16].includes(bitDepth)) fail("PNG declares unsupported color type or bit depth.");
  return {format:"PNG",...dim,bit_depth:bitDepth,color_type:colorType,
    alpha_channel_present:colorType===4||colorType===6,
    transparency_metadata_present:transparency,animation_metadata_present:animated,frames_detected:null};
}
function parseJpeg(buffer) {
  if(buffer.length<4||buffer[0]!==0xff||buffer[1]!==0xd8) fail("invalid or truncated JPEG header.");
  const sof=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
  let offset=2;
  while(offset<buffer.length){
    if(buffer[offset]!==0xff){offset++;continue;}
    while(offset<buffer.length&&buffer[offset]===0xff) offset++;
    if(offset>=buffer.length) break;
    const marker=buffer[offset++];
    if(marker===0xd9||marker===0xda) break;
    if(marker===0x01||(marker>=0xd0&&marker<=0xd7)||marker===0xd8) continue;
    if(offset+2>buffer.length) fail("truncated JPEG segment length.");
    const length=buffer.readUInt16BE(offset);
    if(length<2||offset+length>buffer.length) fail("truncated JPEG segment.");
    if(sof.has(marker)){
      if(length<8) fail("invalid JPEG frame header.");
      const start=offset+2, height=buffer.readUInt16BE(start+1), width=buffer.readUInt16BE(start+3);
      return {format:"JPEG",...dimensions(width,height,"JPEG"),bit_depth:buffer[start],
        color_components:buffer[start+5],alpha_channel_present:false,
        transparency_metadata_present:false,animation_metadata_present:false,frames_detected:1};
    }
    offset+=length;
  }
  fail("JPEG has no supported start-of-frame dimension marker.");
}
function skipGifSubBlocks(buffer,start){
  let offset=start;
  while(offset<buffer.length){const size=buffer[offset++];if(size===0)return offset;
    if(offset+size>buffer.length)fail("truncated GIF data sub-block.");offset+=size;}
  fail("GIF data sub-blocks are missing their terminator.");
}
function parseGif(buffer){
  if(buffer.length<14||!["GIF87a","GIF89a"].includes(buffer.toString("ascii",0,6))) fail("invalid or truncated GIF header.");
  const width=buffer.readUInt16LE(6),height=buffer.readUInt16LE(8),packed=buffer[10];
  let offset=13+((packed&0x80)?3*(1<<((packed&7)+1)):0);
  if(offset>buffer.length)fail("truncated GIF global color table.");
  let transparency=false,loop=false,frames=0,trailer=false;
  while(offset<buffer.length){
    const marker=buffer[offset++];
    if(marker===0x3b){trailer=true;break;}
    if(marker===0x21){
      if(offset>=buffer.length)fail("truncated GIF extension.");
      const label=buffer[offset++];
      if(label===0xf9){
        if(offset+6>buffer.length)fail("truncated GIF graphic control extension.");
        const size=buffer[offset++];if(size!==4||offset+5>buffer.length)fail("invalid GIF graphic control extension.");
        transparency=transparency||Boolean(buffer[offset]&1);offset+=4;
        if(buffer[offset++]!==0)fail("GIF graphic control extension has no terminator.");
      }else{
        let first=true,terminated=false;
        while(offset<buffer.length){
          const size=buffer[offset++];if(size===0){terminated=true;break;}
          if(offset+size>buffer.length)fail("truncated GIF extension data.");
          if(label===0xff&&first){
            const app=buffer.toString("ascii",offset,offset+size);
            if(app.includes("NETSCAPE2.0")||app.includes("ANIMEXTS1.0"))loop=true;
          }
          first=false;offset+=size;
        }
        if(!terminated)fail("GIF extension is missing its terminator.");
      }
      continue;
    }
    if(marker===0x2c){
      if(offset+9>buffer.length)fail("truncated GIF image descriptor.");
      const flags=buffer[offset+8];offset+=9;
      if(flags&0x80)offset+=3*(1<<((flags&7)+1));
      if(offset+1>buffer.length)fail("GIF image data is missing.");
      offset++;offset=skipGifSubBlocks(buffer,offset);frames++;continue;
    }
    fail("unknown GIF block marker 0x"+marker.toString(16)+".");
  }
  if(!trailer||frames<1)fail("GIF is missing a trailer or image frame.");
  return {format:"GIF",...dimensions(width,height,"GIF"),bit_depth:null,color_components:null,
    alpha_channel_present:false,transparency_metadata_present:transparency,
    animation_metadata_present:frames>1||loop,frames_detected:frames};
}
function readUInt24LE(buffer,offset){
  return buffer[offset]|(buffer[offset+1]<<8)|(buffer[offset+2]<<16);
}
function parseWebp(buffer){
  if(buffer.length<20||buffer.toString("ascii",0,4)!=="RIFF"||buffer.toString("ascii",8,12)!=="WEBP")fail("invalid or truncated WebP RIFF header.");
  const end=buffer.readUInt32LE(4)+8;
  if(end>buffer.length||end<20)fail("WebP RIFF length exceeds available data.");
  let offset=12,dim=null,alpha=false,animated=false;
  while(offset+8<=end){
    const type=buffer.toString("ascii",offset,offset+4),length=buffer.readUInt32LE(offset+4);
    const start=offset+8,finish=start+length;if(finish>end)fail("truncated WebP "+type+" chunk.");
    if(type==="VP8X"){
      if(length<10)fail("invalid WebP VP8X header.");
      const flags=buffer[start];alpha=alpha||Boolean(flags&0x10);animated=animated||Boolean(flags&2);
      dim=dimensions(readUInt24LE(buffer,start+4)+1,readUInt24LE(buffer,start+7)+1,"WebP");
    }else if(type==="VP8L"&&!dim){
      if(length<5||buffer[start]!==0x2f)fail("invalid WebP VP8L header.");
      const b1=buffer[start+1],b2=buffer[start+2],b3=buffer[start+3],b4=buffer[start+4];
      dim=dimensions(1+(b1|((b2&0x3f)<<8)),1+(((b2&0xc0)>>6)|(b3<<2)|((b4&0x0f)<<10)),"WebP");
      alpha=alpha||Boolean(b4&0x10);
    }else if(type==="VP8 "&&!dim){
      if(length<10||buffer[start+3]!==0x9d||buffer[start+4]!==1||buffer[start+5]!==0x2a)fail("invalid WebP VP8 frame header.");
      dim=dimensions(buffer.readUInt16LE(start+6)&0x3fff,buffer.readUInt16LE(start+8)&0x3fff,"WebP");
    }else if(type==="ANIM"||type==="ANMF")animated=true;
    else if(type==="ALPH")alpha=true;
    offset=finish+(length&1);
  }
  if(!dim)fail("WebP has no readable VP8X, VP8L or VP8 dimension chunk.");
  return {format:"WebP",...dim,bit_depth:null,color_components:null,alpha_channel_present:alpha,
    transparency_metadata_present:alpha,animation_metadata_present:animated,frames_detected:null};
}
export function inspectImageBuffer(buffer){
  if(!Buffer.isBuffer(buffer))fail("inspectImageBuffer expects a Node Buffer.");
  if(buffer.length>=8&&buffer[0]===0x89&&buffer.toString("ascii",1,4)==="PNG")return parsePng(buffer);
  if(buffer.length>=2&&buffer[0]===0xff&&buffer[1]===0xd8)return parseJpeg(buffer);
  if(buffer.length>=6&&buffer.toString("ascii",0,3)==="GIF")return parseGif(buffer);
  if(buffer.length>=12&&buffer.toString("ascii",0,4)==="RIFF"&&buffer.toString("ascii",8,12)==="WEBP")return parseWebp(buffer);
  fail("unsupported or unrecognized raster image header.");
}
function sha256(buffer){return crypto.createHash("sha256").update(buffer).digest("hex");}
function walkImages(directory,output){
  const entries=fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,"en"));
  for(const entry of entries){
    const absolute=path.join(directory,entry.name);
    if(entry.isDirectory()){walkImages(absolute,output);continue;}
    if(!entry.isFile())continue;
    const extension=path.extname(entry.name).toLowerCase();
    if(SUPPORTED_EXTENSIONS.has(extension)||UNSUPPORTED_IMAGE_EXTENSIONS.has(extension)){
      output.push({absolute,relative:path.relative(ROOT,absolute).split(path.sep).join("/"),extension});
    }
  }
}
function buildAudit(){
  const candidates=[];
  for(const root of SCAN_ROOTS){
    const absolute=path.join(ROOT,root);
    if(!fs.existsSync(absolute)||!fs.statSync(absolute).isDirectory())fail("required source directory is missing: "+root);
    walkImages(absolute,candidates);
  }
  candidates.sort((a,b)=>a.relative.localeCompare(b.relative,"en"));
  const records=[],failures=[],unsupported=[],byRoot={},byFormat={};
  let totalBytes=0,alphaCount=0,transparencyCount=0,animationCount=0;
  for(const file of candidates){
    const buffer=fs.readFileSync(file.absolute);
    const root=SCAN_ROOTS.find(item=>file.relative===item||file.relative.startsWith(item+"/"));
    totalBytes+=buffer.length;
    if(!byRoot[root])byRoot[root]={file_count:0,total_bytes:0};
    byRoot[root].file_count++;byRoot[root].total_bytes+=buffer.length;
    const base={path:file.relative,extension:file.extension,file_size_bytes:buffer.length,sha256:sha256(buffer)};
    if(!SUPPORTED_EXTENSIONS.has(file.extension)){
      unsupported.push({...base,reason:"image_extension_not_supported_by_metadata_parser"});continue;
    }
    try{
      const info=inspectImageBuffer(buffer);
      records.push({...base,...info,pixel_alpha_values_scanned:false,exif_orientation_applied:false,
        visual_review:"not_performed_by_metadata_audit",production_approval:"not_assessed"});
      byFormat[info.format]=(byFormat[info.format]||0)+1;
      if(info.alpha_channel_present)alphaCount++;
      if(info.transparency_metadata_present)transparencyCount++;
      if(info.animation_metadata_present)animationCount++;
    }catch(error){failures.push({path:file.relative,error:String(error.message||error)});}
  }
  const summary={
    scanned_roots:SCAN_ROOTS.slice(),candidate_image_files:candidates.length,parsed_image_files:records.length,
    unsupported_image_files:unsupported.length,parse_failures:failures.length,total_file_bytes:totalBytes,
    files_by_root:byRoot,files_by_detected_format:byFormat,alpha_channel_declared_count:alphaCount,
    transparency_metadata_declared_count:transparencyCount,animation_metadata_declared_count:animationCount,
    pixel_alpha_values_scanned:false,exif_orientation_applied:false,full_human_visual_review_completed:false,
    licensing_review_completed:false
  };
  return {schema_version:1,generator:"Minglora LIVE raster image metadata audit",generated_at:new Date().toISOString(),
    scope_note:"Read-only raster metadata inspection. Header transparency flags do not establish that any pixels are actually transparent.",
    summary,images:records,unsupported_images:unsupported,failures};
}
function markdownReport(audit){
  const lines=[
    "# Minglora LIVE — Raster Image Metadata Audit","",
    "**Generated:** "+audit.generated_at,"","## Summary","","| Metric | Value |","|---|---:|",
    "| Candidate image files | "+audit.summary.candidate_image_files+" |",
    "| Parsed image files | "+audit.summary.parsed_image_files+" |",
    "| Unsupported image files | "+audit.summary.unsupported_image_files+" |",
    "| Parse failures | "+audit.summary.parse_failures+" |",
    "| Total bytes | "+audit.summary.total_file_bytes+" |",
    "| Files with declared alpha channel | "+audit.summary.alpha_channel_declared_count+" |",
    "| Files with transparency metadata | "+audit.summary.transparency_metadata_declared_count+" |",
    "| Files with animation metadata | "+audit.summary.animation_metadata_declared_count+" |",
    "","## Source folders","","| Folder | Files | Bytes |","|---|---:|---:|"
  ];
  for(const root of SCAN_ROOTS){
    const value=audit.summary.files_by_root[root]||{file_count:0,total_bytes:0};
    lines.push("| "+root+" | "+value.file_count+" | "+value.total_bytes+" |");
  }
  lines.push("","## Detected formats","","| Format | Files |","|---|---:|");
  for(const format of Object.keys(audit.summary.files_by_detected_format).sort()){
    lines.push("| "+format+" | "+audit.summary.files_by_detected_format[format]+" |");
  }
  lines.push("","## Interpretation limits","",
    "- Dimensions and format are read from raster headers; JPEG dimensions are stored without applying EXIF orientation.",
    "- Alpha-channel and transparency-chunk/flag fields describe encoded capability or metadata only. This audit does not scan per-pixel alpha and cannot certify a transparent background.",
    "- Human visual review, quality grading, rights/licence clearance and production approval are outside this audit.",
    "- Source images and extracted artwork are read only; this audit does not copy, transform, rename or delete source files.",
    "- Unsupported formats and parse failures are listed in JSON and make the audit command exit unsuccessfully.");
  if(audit.failures.length){lines.push("","## Parse failures","");for(const item of audit.failures)lines.push("- "+item.path+" — "+item.error);}
  if(audit.unsupported_images.length){lines.push("","## Unsupported image formats","");for(const item of audit.unsupported_images)lines.push("- "+item.path+" — "+item.reason);}
  lines.push("");return lines.join("\n");
}
function writeAtomic(file,content){
  const temporary=file+".tmp-"+process.pid;
  fs.writeFileSync(temporary,content,{encoding:"utf8",flag:"wx"});
  fs.renameSync(temporary,file);
}
export function main(){
  const audit=buildAudit();
  fs.mkdirSync(REPORT_DIR,{recursive:true});
  writeAtomic(JSON_OUTPUT,JSON.stringify(audit,null,2)+"\n");
  writeAtomic(MARKDOWN_OUTPUT,markdownReport(audit));
  process.stdout.write("[Minglora LIVE image metadata audit] inspected "+audit.summary.candidate_image_files+
    " source images; parsed "+audit.summary.parsed_image_files+"; failures "+audit.summary.parse_failures+
    "; unsupported "+audit.summary.unsupported_image_files+".\n");
  if(audit.summary.parse_failures||audit.summary.unsupported_image_files)process.exitCode=1;
  return audit.summary;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
