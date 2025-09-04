import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private loggedIn = new BehaviorSubject<boolean>(this.hasToken());
  isLoggedIn = this.loggedIn.asObservable();

  constructor(private router: Router) { }

  private hasToken(): boolean {
    return !!localStorage.getItem('user_data');
  }

  login(userData: { nombre: string, correo: string }) {
    localStorage.setItem('user_data', JSON.stringify(userData));
    this.loggedIn.next(true);
    this.router.navigate(['/main']); // Navigate to main app page after login
  }

  logout() {
    localStorage.removeItem('user_data');
    this.loggedIn.next(false);
    this.router.navigate(['/login']);
  }

  getUserData() {
    const userData = localStorage.getItem('user_data');
    return userData ? JSON.parse(userData) : null;
  }
}
