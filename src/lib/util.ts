export const convertDateToIso = (datetime?: number): string | undefined => {
  if (!datetime) {
    return undefined;
  }
  return new Date(datetime).toISOString();
};

export type Link = {
  id?: string;
  uri?: string;
  notebook: string;
  notebookId?: string;
  title?: string;
  created?: number;
  tags?: string[];
  description?: string;
};

export const getEvernoteWebLink = (notebookId?: string, noteId?: string) =>
  notebookId && noteId
    ? `https://www.evernote.com/client/web#?b=${notebookId}&n=${noteId}`
    : undefined;
