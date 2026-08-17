// Una riga per ogni Id da togliere dalla coda: il nodo dopo cancella per Id,
// uno alla volta. Così un allegato non cancella mai la riga di un altro
// allegato che sta ancora aspettando il suo turno.
let ids = [];
try { ids = $('Buffer - Sono l\'ultimo?').first().json._da_cancellare || []; } catch (e) { ids = []; }
return ids.filter((x) => x != null).map((id) => ({ json: { id: id } }));
