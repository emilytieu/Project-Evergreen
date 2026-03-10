const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
        }
    });
}, {
    threshold: 0.1
});

document.querySelectorAll('.slide-in').forEach((el) => {
    observer.observe(el);
});

fetch("/api/energy")
  .then(res => res.json())
  .then(data => {

    const countries = data.map(d => d.country);
    const energy = data.map(d => d.energy_use);

    const ctx = document.getElementById("energyChart");

    new Chart(ctx, {
      type: "bar",
      data: {
        labels: countries,
        datasets: [{
          label: "Energy Consumption (kg oil equivalent per capita)",
          data: energy,
          backgroundColor: "#181749"
        }]
      },
      options: {
        responsive: true,
      }
    });
  });