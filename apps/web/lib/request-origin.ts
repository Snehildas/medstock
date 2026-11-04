export function sameOriginMutation(input: {
  method: string;
  origin: string | null;
  fetchSite: string | null;
  appOrigin: string;
}): boolean {
  const method = input.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return input.fetchSite !== "cross-site";
  }
  if (input.fetchSite === "cross-site") {
    return false;
  }
  if (input.origin) {
    return input.origin === input.appOrigin;
  }
  return false;
}
