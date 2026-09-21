import * as THREE from './vendor/three.module.js';

// A real 2D skeletal mesh: the original character artwork is skinned to seven
// independently animated bones. Coordinates are calibrated to denis.png.
export async function mountPortrait(host,control){
  let renderer;
  try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'})}catch{control.disabled=true;return}
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
  host.append(renderer.domElement);
  const scene=new THREE.Scene();
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=3;
  const texture=await new THREE.TextureLoader().loadAsync('/assets/denis.png');
  texture.colorSpace=THREE.SRGBColorSpace;
  const geometry=new THREE.PlaneGeometry(2,2,100,120);
  // Keep the shoulders and face in frame. Crop by texture coordinates only;
  // original user artwork remains untouched on disk.
  const crop={left:.265,right:.735,top:.045,bottom:.355};
  const uv=geometry.attributes.uv;
  for(let i=0;i<uv.count;i++)uv.setXY(i,crop.left+uv.getX(i)*(crop.right-crop.left),1-crop.bottom+uv.getY(i)*(crop.bottom-crop.top));
  function bone(name,x,y,parent){const b=new THREE.Bone();b.name=name;b.position.set(x,y,0);if(parent)parent.add(b);return b}
  const root=bone('torso',0,-.85);
  const neck=bone('neck',0,.50,root);
  const head=bone('head',0,.10,neck);
  const left=bone('shoulderLeft',-.57,.13,root);
  const right=bone('shoulderRight',.57,.13,root);
  const eyeLeft=bone('eyelidLeft',-.17,.38,head);
  const eyeRight=bone('eyelidRight',.17,.38,head);
  const bones=[root,neck,head,left,right,eyeLeft,eyeRight];
  const indices=[],weights=[];
  const smooth=(a,b,x)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
  for(let i=0;i<geometry.attributes.position.count;i++){
    const x=geometry.attributes.position.getX(i),y=geometry.attributes.position.getY(i);
    const headWeight=smooth(-.45,-.25,y);
    const neckWeight=(1-headWeight)*smooth(-.6,-.2,y);
    const shoulderWeight=(1-headWeight-neckWeight)*smooth(.12,.58,Math.abs(x))*.8;
    const eyeL=Math.exp(-(((x+.17)/.10)**2)-(((y-.13)/.045)**2))*.96;
    const eyeR=Math.exp(-(((x-.17)/.10)**2)-(((y-.13)/.045)**2))*.96;
    const eye=Math.max(eyeL,eyeR);
    const values=[[0,(1-headWeight-neckWeight-shoulderWeight)*(1-eye)],[1,neckWeight*(1-eye)],[2,headWeight*(1-eye)],[x<0?3:4,shoulderWeight*(1-eye)],[eyeL>eyeR?5:6,eye]].sort((a,b)=>b[1]-a[1]).slice(0,4);
    const total=values.reduce((s,v)=>s+v[1],0);
    values.forEach(([index,weight])=>{indices.push(index);weights.push(weight/total)});
  }
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide});
  const mesh=new THREE.SkinnedMesh(geometry,material);mesh.add(root);mesh.bind(new THREE.Skeleton(bones));mesh.frustumCulled=false;scene.add(mesh);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');let paused=reduced.matches,visible=true,frame=0,last=0,elapsed=0;
  function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);const aspect=w/h;camera.left=-aspect;camera.right=aspect;camera.top=1;camera.bottom=-1;camera.updateProjectionMatrix();const sourceAspect=(1024*(crop.right-crop.left))/(1536*(crop.bottom-crop.top));mesh.scale.x=sourceAspect;renderer.render(scene,camera)}
  const observer=new ResizeObserver(resize);observer.observe(host);
  function draw(now){frame=0;if(document.hidden||!visible)return;const dt=last?Math.min((now-last)/1000,.05):0;last=now;if(!paused)elapsed+=dt;const t=elapsed;
    root.position.y=-.85+Math.sin(t*1.25)*.008;
    root.rotation.z=Math.sin(t*.52)*.003;
    neck.rotation.z=Math.sin(t*.61+.6)*.008;
    head.rotation.z=Math.sin(t*.43)*.012;
    head.rotation.y=Math.sin(t*.34)*.018;
    left.rotation.z=Math.sin(t*1.25)*.006;right.rotation.z=-Math.sin(t*1.25)*.006;
    // Short double-lid movement on a nonuniform schedule, not a whole-face squish.
    const phase=t%9.3;const pulse=c=>Math.max(0,1-Math.abs(phase-c)/.11);
    const blink=Math.max(pulse(3.4),pulse(7.6));
    eyeLeft.scale.y=eyeRight.scale.y=1-blink*.88;
    renderer.render(scene,camera);if(!paused)frame=requestAnimationFrame(draw);
  }
  function start(){last=0;if(!frame)frame=requestAnimationFrame(draw)}
  function syncControl(){control.setAttribute('aria-pressed',String(paused));control.setAttribute('aria-label',paused?'Включить анимацию':'Приостановить анимацию');control.querySelector('path').setAttribute('d',paused?'m9 5 10 7-10 7Z':'M9 6v12M15 6v12')}
  control.addEventListener('click',()=>{paused=!paused;syncControl();start()});
  reduced.addEventListener('change',()=>{paused=reduced.matches;syncControl();start()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)start()});
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)start()}).observe(host);
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(frame);frame=0;host.classList.remove('ready');control.disabled=true});
  resize();syncControl();host.classList.add('ready');host.dataset.rig='7-bone-skinned-mesh';start();
}
