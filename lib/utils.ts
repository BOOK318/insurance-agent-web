import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatHKD(amount: number) {
  return `HK$${amount.toLocaleString('zh-HK')}`;
}

export function formatDate(date: string) {
  return new Date(date).toLocaleDateString('zh-HK');
}

export function calcAge(dob: string) {
  return Math.floor((Date.now() - new Date(dob).getTime()) / 31536000000);
}
