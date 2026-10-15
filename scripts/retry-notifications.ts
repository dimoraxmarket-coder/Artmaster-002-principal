import './environment';
import { retryNotifications } from '../src/lib/server/notifications';
retryNotifications().then(result=>console.log(`Notificări verificate: ${result.checked}; acceptate de furnizor: ${result.sent}.`)).catch(()=>{console.error('Notificările nu au putut fi reîncercate. Verifică configurația serviciilor.');process.exitCode=1;});
