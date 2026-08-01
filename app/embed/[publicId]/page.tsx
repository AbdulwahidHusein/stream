type Props = {
  params: Promise<{ publicId: string }>;
};

export default async function EmbedPage({ params }: Props) {
  const { publicId } = await params;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--ink)] p-4 text-white">
      <p className="font-mono text-sm opacity-70">Embed · {publicId}</p>
    </main>
  );
}
