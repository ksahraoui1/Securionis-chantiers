import { PushNotificationsCard } from "@/components/ui/push-notifications-card";

export default function NotificationsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Notifications</h1>
      <p className="text-sm text-gray-500 mb-6">
        Gérez les notifications push sur cet appareil.
      </p>
      <PushNotificationsCard />
    </div>
  );
}
