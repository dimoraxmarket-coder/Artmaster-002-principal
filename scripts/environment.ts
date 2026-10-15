// Node 24 loads the existing local configuration without printing secrets or
// overriding variables already injected by the hosting environment.
const mode=process.env.NODE_ENV||'development';
for(const file of [`.env.${mode}.local`,'.env.local',`.env.${mode}`,'.env']){
  try{process.loadEnvFile(file);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
}
