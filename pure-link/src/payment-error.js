export class PaymentError extends Error {
  constructor(code = 'billingUnavailable', status = 503) {
    super(code);
    this.name = 'PaymentError';
    this.code = code;
    this.status = status;
  }
}
