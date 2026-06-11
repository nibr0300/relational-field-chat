// List Google Drive files/folders via Lovable connector gateway.
// Body: { folder_id?: string (default "root"), page_token?: string, query?: string }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabaseAnon = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!,
);

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive/drive/v3";

async function getUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try { const { data } = await supabaseAnon.auth.getUser(token); return data.user?.id ?? null; }
  catch { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const userId = await getUserId(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const folderId = body.folder_id || "root";
    const pageToken = body.page_token as string | undefined;
    const searchQuery = (body.query as string | undefined)?.trim();

    const lovKey = Deno.env.get("LOVABLE_API_KEY");
    const drvKey = Deno.env.get("GOOGLE_DRIVE_API_KEY");
    if (!lovKey || !drvKey) throw new Error("Drive-connector saknar nycklar");

    let q: string;
    if (searchQuery) {
      const safe = searchQuery.replace(/'/g, "\\'");
      q = `name contains '${safe}' and trashed = false`;
    } else {
      q = `'${folderId}' in parents and trashed = false`;
    }

    const params = new URLSearchParams({
      q,
      fields: "nextPageToken, files(id,name,mimeType,modifiedTime,size,iconLink,parents)",
      pageSize: "200",
      orderBy: "folder,name",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const url = `${GATEWAY}/files?${params.toString()}`;
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovKey}`,
        "X-Connection-Api-Key": drvKey,
      },
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Drive ${resp.status}: ${txt.slice(0, 400)}`);
    }
    const data = await resp.json();

    // Get folder breadcrumb name (when not root and not searching)
    let folderName: string | null = null;
    if (folderId !== "root" && !searchQuery) {
      try {
        const r = await fetch(`${GATEWAY}/files/${folderId}?fields=id,name,parents`, {
          headers: { Authorization: `Bearer ${lovKey}`, "X-Connection-Api-Key": drvKey },
        });
        if (r.ok) folderName = (await r.json()).name ?? null;
      } catch { /* ignore */ }
    }

    return new Response(JSON.stringify({
      files: data.files ?? [],
      next_page_token: data.nextPageToken ?? null,
      folder_id: folderId,
      folder_name: folderName,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("drive-list:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
