let retainedFile: File | null = null;

export function retainUploadFile(file: File | null) {
  retainedFile = file;
}

export function getRetainedUploadFile() {
  return retainedFile;
}
