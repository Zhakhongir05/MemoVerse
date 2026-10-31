import {gzipSync} from 'node:zlib';
// Tiny synthetic fixtures, not downloaded worlds or new paid generations.
export function spz(){
 const n=4,header=Buffer.alloc(16);header.writeUInt32LE(0x5053474e,0);header.writeUInt32LE(2,4);header.writeUInt32LE(n,8);header[13]=12;
 const positions=Buffer.alloc(n*9);
 [[-.5,-.5,2],[.5,-.5,2],[-.5,.5,2],[.5,.5,2]].forEach((point,i)=>point.forEach((v,j)=>positions.writeIntLE(Math.round(v*4096),i*9+j*3,3)));
 return gzipSync(Buffer.concat([header,positions,Buffer.alloc(n,255),Buffer.alloc(n*3,128),Buffer.alloc(n*3,125),Buffer.alloc(n*3,128)]));
}
export function collider(){
 const data=Buffer.alloc(44);[-3,-3,-2,3,-3,-2,0,3,-2].forEach((n,i)=>data.writeFloatLE(n,i*4));[0,1,2].forEach((n,i)=>data.writeUInt16LE(n,36+i*2));
 const gltf={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],buffers:[{byteLength:44}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36,target:34962},{buffer:0,byteOffset:36,byteLength:6,target:34963}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-3,-3,-2],max:[3,3,-2]},{bufferView:1,componentType:5123,count:3,type:'SCALAR'}]};
 let json=Buffer.from(JSON.stringify(gltf));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
 const header=Buffer.alloc(12);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+json.length+8+data.length,8);
 const j=Buffer.alloc(8);j.writeUInt32LE(json.length);j.writeUInt32LE(0x4e4f534a,4);const b=Buffer.alloc(8);b.writeUInt32LE(data.length);b.writeUInt32LE(0x004e4942,4);
 return Buffer.concat([header,j,json,b,data]);
}
export const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP8z4AdMOEQH6QSAM1BAQ/oQeJvAAAAAElFTkSuQmCC','base64');
