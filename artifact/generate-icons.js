'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const OUT = path.join(__dirname, 'icons');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

const CRC_TBL = (() => {
  const t = new Uint32Array(256);
  for (let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);t[i]=c;}
  return t;
})();
function crc32(buf){let c=0xFFFFFFFF;for(const b of buf)c=(c>>>8)^CRC_TBL[(c^b)&0xFF];return(c^0xFFFFFFFF)>>>0;}
function chunk(type,data){
  const tb=Buffer.from(type,'ascii'),crc=crc32(Buffer.concat([tb,data]));
  const lb=Buffer.alloc(4);lb.writeUInt32BE(data.length);
  const cb=Buffer.alloc(4);cb.writeUInt32BE(crc);
  return Buffer.concat([lb,tb,data,cb]);
}
function encodePNG(size,rgba){
  const raw=Buffer.alloc(size*(1+size*3));
  for(let y=0;y<size;y++){
    raw[y*(1+size*3)]=0;
    for(let x=0;x<size;x++){
      const s=(y*size+x)*4, d=y*(1+size*3)+1+x*3;
      const a=rgba[s+3]/255;
      raw[d  ]=Math.round(rgba[s  ]*a+255*(1-a));
      raw[d+1]=Math.round(rgba[s+1]*a+255*(1-a));
      raw[d+2]=Math.round(rgba[s+2]*a+255*(1-a));
    }
  }
  const comp=zlib.deflateSync(raw,{level:9});
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);
  ihdr[8]=8;ihdr[9]=2;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',ihdr), chunk('IDAT',comp), chunk('IEND',Buffer.alloc(0))
  ]);
}

const GLYPHS={
  M:[0b11111,0b11011,0b10101,0b10001,0b10001,0b10001,0b10001],
  D:[0b11110,0b10001,0b10001,0b10001,0b10001,0b10001,0b11110],
};
function drawIcon(size){
  const buf=new Uint8Array(size*size*4);
  const R=Math.max(2,Math.round(size*0.18));
  // Rounded rect background (#0052CC)
  for(let y=0;y<size;y++) for(let x=0;x<size;x++){
    const cx=x<R?R:(x>=size-R?size-R-1:x);
    const cy=y<R?R:(y>=size-R?size-R-1:y);
    const inside=(x>=R&&x<size-R)||(y>=R&&y<size-R)||Math.hypot(x-cx,y-cy)<=R;
    if(inside){const i=(y*size+x)*4;buf[i]=0;buf[i+1]=82;buf[i+2]=204;buf[i+3]=255;}
  }
  // Text "MD" or "M"
  const text=size>=32?'MD':'M';
  const GW=5,GH=7,GAP=1;
  const sc=Math.max(1,Math.floor(size/22));
  const tw=text.length*GW*sc+(text.length-1)*GAP*sc;
  let cx=Math.round((size-tw)/2);
  const sy=Math.round((size-GH*sc)/2);
  for(const ch of text){
    const rows=GLYPHS[ch]||GLYPHS.M;
    for(let gy=0;gy<GH;gy++) for(let gx=0;gx<GW;gx++){
      if(rows[gy]&(1<<(GW-1-gx))){
        for(let dy=0;dy<sc;dy++) for(let dx=0;dx<sc;dx++){
          const px=cx+gx*sc+dx, py=sy+gy*sc+dy;
          if(px>=0&&py>=0&&px<size&&py<size){
            const i=(py*size+px)*4;buf[i]=255;buf[i+1]=255;buf[i+2]=255;buf[i+3]=255;
          }
        }
      }
    }
    cx+=(GW+GAP)*sc;
  }
  return buf;
}

for(const size of [16,48,128]){
  const png=encodePNG(size,drawIcon(size));
  const out=path.join(OUT,`icon${size}.png`);
  fs.writeFileSync(out,png);
  console.log(`  icon${size}.png  (${png.length}B)`);
}
console.log('Icons ready.');
