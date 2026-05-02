export interface CreateFeedbackRequest {
  responseLogId: string;
  rating: 'accepted' | 'rejected' | 'corrected';
  correctedAnswer?: string;
  reviewerNotes?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateFeedbackResponse {
  id: string;
}
