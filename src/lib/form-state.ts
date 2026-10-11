/** Shape returned by every form server action. */
export type FormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Non-secret values echoed back so the form keeps what the user typed. */
  values?: Record<string, string>;
};

export const initialFormState: FormState = {};
