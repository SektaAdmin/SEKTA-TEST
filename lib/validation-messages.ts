export const VM = {
  required: {
    name:       "Ім'я обов'язкове",
    lastName:   "Прізвище обов'язкове",
    title:      "Назва обов'язкова",
    code:       "Код обов'язковий",
    field:      "Обов'язкове поле",
    sessions:   "Кількість занять обов'язкова",
    price:      "Ціна обов'язкова",
    selectType: "Оберіть тип абонементу",
  },
  invalid: {
    sessionsPositive: "Кількість занять > 0",
    pricePositive:    "Ціна > 0",
    integerOnly:      "Тільки ціле число",
    codePattern:      "Тільки малі латинські букви та цифри",
  },
} as const
