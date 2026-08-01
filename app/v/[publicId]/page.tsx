type Props = {
  params: Promise<{ publicId: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { publicId } = await params;
  return {
    title: `Recording ${publicId}`,
    description: "Watch this Stream recording.",
  };
}

export default async function PlaybackPage({ params }: Props) {
  const { publicId } = await params;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-4xl flex-1 flex-col px-6 py-10 md:px-10">
      <p className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight">
        Stream
      </p>
      <h1 className="mt-10 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
        Playback
      </h1>
      <p className="mt-2 font-mono text-sm text-[var(--ink-muted)]">{publicId}</p>
      <div className="mt-8 aspect-video w-full bg-[var(--ink)]/90" />
      <p className="mt-4 text-sm text-[var(--ink-muted)]">
        Signed playback + OG tags land with the upload pipeline.
      </p>
    </main>
  );
}
