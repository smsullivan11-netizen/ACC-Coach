import Link from "next/link";
import { appUrl, requireDriver } from "@/lib/auth";
import UploadForm from "./UploadForm";

export default async function UploadPage() {
  await requireDriver();
  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-white">Upload by hand</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Most drivers should simply use <Link href="/download" className="text-accent underline">the app</Link>, which
        uploads automatically. From the project folder, the upload script does the same for a recording made with{" "}
        <code>recorder.py</code>: it uses the team&apos;s corner map, builds the session bundle and sends it.
      </p>
      <pre className="mt-3 overflow-x-auto rounded bg-white/5 p-3 text-xs text-zinc-300">
{`.\\.venv\\Scripts\\python upload.py --url ${appUrl()} --token <your upload token> --save
.\\.venv\\Scripts\\python upload.py          (next times: uploads your latest recording)`}
      </pre>
      <p className="mt-2 text-sm text-zinc-400">
        Get an upload token in <Link href="/settings" className="underline">Settings</Link>. Or upload a bundle by hand:
      </p>
      <UploadForm />
    </div>
  );
}
