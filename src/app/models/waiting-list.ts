export interface WaitingListEntry {
  id: number;
  user_id: number;
  class_session_id: number;
  join_date_time: string; // ISO timestamp
  notification_sent: boolean;
  notification_time?: string; // ISO timestamp
  status: 'waiting' | 'notified' | 'expired' | 'cancelled';
}

export interface CreateWaitingListRequest {
  user_id: number | string;
  class_session_id: number;
  status: string;
}
