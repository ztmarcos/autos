import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref } from "firebase/storage";
import { functions, storage } from "@/lib/firebase";

export async function getPdfPageImageUrls(storagePath: string): Promise<string[]> {
  const call = httpsCallable<{ storagePath: string }, { pagePaths: string[] }>(
    functions,
    "getPdfPages",
    { timeout: 120_000 },
  );
  const { data } = await call({ storagePath });
  const paths = data.pagePaths ?? [];
  return Promise.all(paths.map((path) => getDownloadURL(ref(storage, path))));
}
