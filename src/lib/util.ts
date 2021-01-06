export const convertDateToIso = (datetime?: number): string | undefined => {
  if (!datetime) {
    return undefined;
  }
  return new Date(datetime).toISOString();
};

export type Link = {
  link: string;
  notebook: string;
  title?: string;
  created?: number;
  tags?: string[];
  excerpt?: string;
};

export const getEvernoteWebLink = (notebook?: string, note?: string) =>
  notebook && note
    ? `https://www.evernote.com/client/web#?b=${notebook}&n=${note}`
    : undefined;
