type Activity = {
  id: string;
  scanned_at: string;
  city: string | null;
  region: string | null;
  country: string | null;
  campaigns:
    | {
        name: string | null;
        alias: string | null;
        slug: string;
      }[]
    | null;
};

type Props = {
  activity: Activity[];
};

const PHOENIX_TIME_ZONE = "America/Phoenix";

function decodeLocation(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: PHOENIX_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export default function ActivityFeed({
  activity,
}: Props) {
  return (
    <div className="rounded-3xl bg-white p-8 shadow">
      <h2 className="text-2xl font-bold text-[#174734]">
        Recent Activity
      </h2>

      <p className="mt-1 text-sm text-[#6b705c]">
        Times shown in Arizona time.
      </p>

      <div className="mt-6 space-y-4">
        {activity.length === 0 ? (
          <p className="text-[#6b705c]">
            No recent activity.
          </p>
        ) : (
          activity.map((item) => {
            const city =
              decodeLocation(item.city) ?? "Unknown";

            const region = decodeLocation(item.region);

            return (
              <div
                key={item.id}
                className="rounded-2xl bg-[#f7f6f1] p-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-[#174734]">
                      {city}
                      {region ? `, ${region}` : ""}
                    </p>

                    <p className="text-sm text-[#6b705c]">
                      {item.campaigns?.[0]?.alias ||
                        item.campaigns?.[0]?.name ||
                        "Unknown Campaign"}
                    </p>
                  </div>

                  <p className="shrink-0 text-sm text-[#6b705c]">
                    {formatDate(item.scanned_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}