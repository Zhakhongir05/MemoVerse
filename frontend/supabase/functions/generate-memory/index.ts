// Compatibility endpoint retained for old deployed clients. World generation now
// goes through FastAPI's verified account, atomic quota and asynchronous job API.
// Never forward to a second paid upstream or reserve a separate allowance here.
Deno.serve(request => {
  const origin=request.headers.get('origin')||''
  const allowed=(Deno.env.get('ALLOWED_APP_ORIGINS')||'https://memoverse05.vercel.app,http://localhost:5173,http://localhost:5174').split(',').map(value=>value.trim())
  const headers={'Access-Control-Allow-Origin':allowed.includes(origin)?origin:allowed[0],'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'}
  if(request.method==='OPTIONS')return new Response(null,{headers})
  return Response.json({error:'This generation endpoint has retired. Reload MemoVerse and use Generate Realistic 3D World.'},{status:410,headers})
})
