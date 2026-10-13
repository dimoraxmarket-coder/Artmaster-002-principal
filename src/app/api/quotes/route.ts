import { submitQuote } from '@/lib/server/quotes';
import { errorResponse } from '@/lib/server/guards';
export const runtime='nodejs';
export async function POST(request:Request){try{const result=await submitQuote(request);return Response.json(result,{status:result.duplicate?200:201,headers:{'Cache-Control':'no-store'}});}catch(error){return errorResponse(error);}}
