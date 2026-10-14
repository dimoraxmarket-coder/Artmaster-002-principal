export function googleMapLinks(address: string) {
  if (!address.trim()) return undefined;
  const encoded = encodeURIComponent(address.trim());
  return { embed: `https://www.google.com/maps?q=${encoded}&z=15&output=embed`, directions: `https://www.google.com/maps/dir/?api=1&destination=${encoded}`, search: `https://www.google.com/maps/search/?api=1&query=${encoded}` };
}
