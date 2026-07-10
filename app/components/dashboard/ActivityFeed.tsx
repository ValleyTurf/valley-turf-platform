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

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(dateString));
}

export default function ActivityFeed({
  activity,
}: Props) {
  return (
    <div className="rounded-3xl bg-white p-8 shadow">
      <h2 className="text-2xl font-bold text-[#174734]">
        Recent Activity
      </h2>

      <div className="mt-6 space-y-4">
        {activity.length === 0 ? (
          <p className="text-[#6b705c]">
            No recent activity.
          </p>
        ) : (
          activity.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl bg-[#f7f6f1] p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-[#174734]">
                    {item.city ?? "Unknown"}
                    {item.region ? `, ${item.region}` : ""}
                  </p>

                  <p className="text-sm text-[#6b705c]">
                    {item.campaigns?.[0]?.name ??
                      "Unknown Campaign"}
                  </p>
                </div>

                <p className="text-sm text-[#6b705c]">
                  {formatDate(item.scanned_at)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}