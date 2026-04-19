'use strict';
// Reads each existing icon PNG, flood-fills the gray background from all 4
// corners with solid #0052CC, making the icon full-bleed without touching
// the original C→MD design inside.
const fs = require('fs'), path = require('path'), zlib = require('zlib');

const ICONS_DIR = path.join(__dirname, 'artifact', 'icons');

// ── CRC-32 ───────────────────────────────────────────────────────────────────
const CRC_TBL = (() => {
  const t = new Uint32Array(256);
  for (let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);t[i]=c;}
  return t;
})();
function crc32(buf){let c=0xFFFFFFFF;for(const b of buf)c=(c>>>8)^CRC_TBL[(c^b)&0xFF];return(c^0xFFFFFFFF)>>>0;}

// ── PNG encoder (8-bit RGB, no transparency) ─────────────────────────────────
function chunk(type, data) {
  const tb=Buffer.from(type,'ascii'), crc=crc32(Buffer.concat([tb,data]));
  const lb=Buffer.alloc(4); lb.writeUInt32BE(data.length);
  const cb=Buffer.alloc(4); cb.writeUInt32BE(crc);
  return Buffer.concat([lb,tb,data,cb]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y=0;y<h;y++) {
    raw[y*(1+w*3)] = 0;
    for (let x=0;x<w;x++) {
      const s=(y*w+x)*4, d=y*(1+w*3)+1+x*3;
      raw[d]=rgba[s]; raw[d+1]=rgba[s+1]; raw[d+2]=rgba[s+2];
    }
  }
  const comp = zlib.deflateSync(raw, {level:9});
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w,0); ihdr.writeUInt32BE(h,4); ihdr[8]=8; ihdr[9]=2;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',ihdr), chunk('IDAT',comp), chunk('IEND',Buffer.alloc(0))
  ]);
}

// ── PNG decoder → RGBA Uint8Array ─────────────────────────────────────────────
function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}

function parsePNG(buf) {
  let pos=8, width, height, colorType;
  const idatChunks=[];
  while (pos < buf.length) {
    const len=buf.readUInt32BE(pos); pos+=4;
    const type=buf.slice(pos,pos+4).toString(); pos+=4;
    const data=buf.slice(pos,pos+len); pos+=len+4;
    if (type==='IHDR'){ width=data.readUInt32BE(0); height=data.readUInt32BE(4); colorType=data[9]; }
    else if (type==='IDAT') idatChunks.push(data);
    else if (type==='IEND') break;
  }
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const bpp = colorType===6?4:colorType===2?3:colorType===4?2:1;
  const stride = 1+width*bpp;
  const recon = new Uint8Array(width*height*bpp);

  for (let y=0;y<height;y++) {
    const ft=raw[y*stride];
    for (let x=0;x<width*bpp;x++) {
      const f=raw[y*stride+1+x];
      const a=x>=bpp?recon[y*width*bpp+x-bpp]:0;
      const b=y>0?recon[(y-1)*width*bpp+x]:0;
      const c=y>0&&x>=bpp?recon[(y-1)*width*bpp+x-bpp]:0;
      let r;
      switch(ft){case 0:r=f;break;case 1:r=(f+a)&0xFF;break;case 2:r=(f+b)&0xFF;break;case 3:r=(f+((a+b)>>1))&0xFF;break;case 4:r=(f+paeth(a,b,c))&0xFF;break;default:r=f;}
      recon[y*width*bpp+x]=r;
    }
  }

  const rgba = new Uint8Array(width*height*4);
  for (let i=0;i<width*height;i++) {
    if      (colorType===6){rgba.set(recon.slice(i*4,i*4+4),i*4);}
    else if (colorType===2){rgba[i*4]=recon[i*3];rgba[i*4+1]=recon[i*3+1];rgba[i*4+2]=recon[i*3+2];rgba[i*4+3]=255;}
    else if (colorType===4){rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=recon[i*2];rgba[i*4+3]=recon[i*2+1];}
    else                   {rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=recon[i];rgba[i*4+3]=255;}
  }
  return {width, height, rgba};
}

// ── Flood fill gray background from all 4 corners → solid blue ───────────────
// "Gray" = max channel difference < 20 (neutral tone, not the blue circle)
function floodFillBg(rgba, w, h, fillR=0, fillG=82, fillB=204) {
  const visited = new Uint8Array(w * h);
  const queue   = [];

  function isGray(i) {
    const r=rgba[i*4], g=rgba[i*4+1], b=rgba[i*4+2];
    return Math.max(Math.abs(r-g), Math.abs(r-b), Math.abs(g-b)) < 20;
  }

  for (const [sx, sy] of [[0,0],[w-1,0],[0,h-1],[w-1,h-1]]) {
    const i = sy*w+sx;
    if (!visited[i] && isGray(i)) { visited[i]=1; queue.push(i); }
  }

  while (queue.length) {
    const idx = queue.shift();
    // Replace with solid fill colour
    rgba[idx*4]=fillR; rgba[idx*4+1]=fillG; rgba[idx*4+2]=fillB; rgba[idx*4+3]=255;
    const x=idx%w, y=(idx/w)|0;
    for (const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]) {
      if (nx<0||ny<0||nx>=w||ny>=h) continue;
      const ni=ny*w+nx;
      if (!visited[ni] && isGray(ni)) { visited[ni]=1; queue.push(ni); }
    }
  }
  return rgba;
}

// ── Main ─────────────────────────────────────────────────────────────────────
for (const size of [16,32,48,128]) {
  const file = path.join(ICONS_DIR, `icon${size}.png`);
  const {width, height, rgba} = parsePNG(fs.readFileSync(file));
  floodFillBg(rgba, width, height);
  const png = encodePNG(width, height, rgba);
  fs.writeFileSync(file, png);
  console.log(`  icon${size}.png  (${width}×${height}) → full-bleed  ${png.length}B`);
}
console.log('Done.');
