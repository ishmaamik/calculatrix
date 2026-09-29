import { calculateResult } from '../services/calculator.service.js';

export function calculate(req, res) {
  const body = req.body || {};
  const operation = body.operation;
  const firstNumber = body.firstNumber;
  const secondNumber = body.secondNumber;

  if (operation !== 'add' && operation !== 'subtract' && operation !== 'multiply' && operation !== 'divide') {
    return res.status(400).json({
      error: 'Operation must be add, subtract, multiply, or divide',
    });
  }

  if (!Number.isFinite(firstNumber) || !Number.isFinite(secondNumber)) {
    return res.status(400).json({
      error: 'Both firstNumber and secondNumber must be finite numbers',
    });
  }

  if (operation === 'divide' && secondNumber === 0) {
    return res.status(400).json({
      error: 'Cannot divide by zero',
    });
  }

  const result = calculateResult(operation, firstNumber, secondNumber);

  return res.status(200).json({
    operation,
    firstNumber,
    secondNumber,
    result,
  });
}
