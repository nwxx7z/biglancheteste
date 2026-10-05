const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const ORDERS = path.join(ROOT, "data", "orders.json");

if (!fs.existsSync(path.dirname(ORDERS))) fs.mkdirSync(path.dirname(ORDERS), {recursive:true});
if (!fs.existsSync(ORDERS)) fs.writeFileSync(ORDERS, "[]", "utf8");

const read = () => {
  try { return JSON.parse(fs.readFileSync(ORDERS, "utf8")); }
  catch { return []; }
};
const write = data => fs.writeFileSync(ORDERS, JSON.stringify(data, null, 2), "utf8");

function send(res, status, data){
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type":"application/json; charset=utf-8",
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Methods":"GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type",
    "Cache-Control":"no-store"
  });
  res.end(body);
}

function readBody(req){
  return new Promise((resolve,reject)=>{
    const parts=[]; let bytes=0;
    req.on("data", c=>{ bytes+=c.length; if(bytes>512000){reject(new Error("payload too large")); req.destroy();} else parts.push(c); });
    req.on("end",()=>resolve(Buffer.concat(parts).toString("utf8")));
    req.on("error",reject);
  });
}

function id(){ return Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,8); }

function normalize(x){
  return {
    cart:(Array.isArray(x.cart)?x.cart:[]).slice(0,50).map(i=>({
      name:String(i.name||"Item").slice(0,120),
      quantity:Math.max(1,Math.min(999,Number(i.quantity)||1)),
      price:Math.max(0,Number(i.price)||0),
      note:String(i.note||"").slice(0,300),
      additions:(Array.isArray(i.additions)?i.additions:[]).slice(0,30).map(a=>({
        name:String(a.name||"").slice(0,100),
        price:Math.max(0,Number(a.price)||0),
        quantity:Math.max(1,Math.min(99,Number(a.quantity)||1))
      }))
    })),
    delivery:{
      city:String(x.delivery?.city||"").slice(0,80),
      fee:Math.max(0,Number(x.delivery?.fee)||0),
      address:String(x.delivery?.address||"").slice(0,500)
    },
    payment:String(x.payment||"").slice(0,80),
    notes:String(x.notes||"").slice(0,1000),
    total:Math.max(0,Number(x.total)||0)
  };
}

const server = http.createServer(async (req,res)=>{
  res.setHeader("Access-Control-Allow-Origin","*");
  if(req.method==="OPTIONS"){res.writeHead(204); return res.end();}

  const url = new URL(req.url, "http://localhost");

  if(req.method==="GET" && url.pathname==="/api/health")
    return send(res,200,{ok:true});

  if(req.method==="GET" && url.pathname==="/api/orders"){
    const all=read();
    return send(res,200,all.slice().reverse().slice(0,100));
  }

  if(req.method==="POST" && url.pathname==="/api/orders"){
    try{
      const input=JSON.parse(await readBody(req));
      const data=normalize(input);
      if(!data.cart.length) return send(res,400,{error:"Pedido vazio"});
      const orders=read();
      const number=Math.max(1000,...orders.map(o=>Number(o.number)||1000))+1;
      const order={id:id(),number,status:"new",printed:false,createdAt:new Date().toISOString(),...data};
      orders.push(order); write(orders);
      return send(res,201,order);
    }catch(e){ return send(res,400,{error:"Pedido inválido"}); }
  }

  const m=url.pathname.match(/^\/api\/orders\/([^/]+)$/);
  if(req.method==="PATCH" && m){
    try{
      const orders=read(), i=orders.findIndex(o=>o.id===decodeURIComponent(m[1]));
      if(i<0) return send(res,404,{error:"Pedido não encontrado"});
      const x=JSON.parse(await readBody(req));
      const allowed=["new","preparing","ready","cancelled","printed"];
      if(!allowed.includes(x.status)) return send(res,400,{error:"Status inválido"});
      orders[i].status=x.status;
      if(x.status==="printed") orders[i].printed=true;
      write(orders);
      return send(res,200,orders[i]);
    }catch(e){return send(res,400,{error:"Atualização inválida"});}
  }

  if(req.method==="GET" && (url.pathname==="/" || url.pathname==="/index.html")){
    const file=fs.readFileSync(path.join(ROOT,"site","index.html"));
    res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}); return res.end(file);
  }

  if(req.method==="GET" && (url.pathname==="/cozinha" || url.pathname==="/cozinha/")){
    const file=fs.readFileSync(path.join(ROOT,"kitchen","index.html"));
    res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}); return res.end(file);
  }

  send(res,404,{error:"Not found"});
});

server.listen(PORT,()=>console.log(`BIG LANCHE: http://localhost:${PORT} | cozinha: http://localhost:${PORT}/cozinha`));
