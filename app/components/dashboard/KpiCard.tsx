type KpiCardProps = {
  title: string;
  value: number | string;
  icon: string;
  subtitle?: string;
};

export default function KpiCard({
  title,
  value,
  icon,
  subtitle,
}: KpiCardProps) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow transition hover:shadow-lg">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9c7a20]">
            {title}
          </p>

          <h2 className="mt-3 text-4xl font-bold text-[#174734]">
            {value}
          </h2>

          {subtitle && (
            <p className="mt-2 text-sm text-[#6b705c]">
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f7f6f1] text-4xl">
          {icon}
        </div>
      </div>
    </div>
  );
}