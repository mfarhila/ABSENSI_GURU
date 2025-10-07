document.addEventListener("DOMContentLoaded", () => {
  const hour = new Date().getHours();
  let greeting = "Halo!";
  
  if (hour < 12) {
    greeting = "Selamat Pagi 🌞";
  } else if (hour < 18) {
    greeting = "Selamat Siang ☀️";
  } else {
    greeting = "Selamat Malam 🌙";
  }

  const el = document.getElementById("greeting");
  if (el) {
    el.innerText = greeting;
  }
});
