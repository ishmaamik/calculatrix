export function calculateResult(operation, firstNumber, secondNumber) {
  switch (operation) {
    case 'add':
      return firstNumber + secondNumber;
    case 'subtract':
      return firstNumber - secondNumber;
    case 'multiply':
      return firstNumber * secondNumber;
    case 'divide':
      return firstNumber / secondNumber;
    default:
      throw new Error('Invalid operation');
  }
}