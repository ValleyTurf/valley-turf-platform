import MapLoader from "./MapLoader";

export default function CustomerMapPage() {
  return (
    <main className="flex min-h-screen flex-col bg-[#f5f4ef] p-8">
      <div className="mx-auto w-full max-w-7xl">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
          Valley Turf Revival OS
        </p>
        <h1 className="mt-2 text-4xl font-bold text-[#174734]">
          Customer Map
        </h1>
      </div>

      <div className="mx-auto mt-6 h-[75vh] w-full max-w-7xl overflow-hidden rounded-3xl border border-[#e7e2d5] shadow">
        <MapLoader />
      </div>
    </main>
  );
}
