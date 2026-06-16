// Background runner — se executa la fiecare 15 minute
// Citeste date din Health (Apple Health / Google Health Connect)
// si le salveaza in storage pentru popup la deschidere

addEventListener('healthSync', async (resolve, reject, args) => {
  try {
    const now = new Date();
    const since = new Date(now.getTime() - 15 * 60 * 1000); // ultimele 15 min

    // Citeste pasi, calorii, ritm cardiac din Health API
    const steps = await CapacitorHealth.query({
      startDate: since.toISOString(),
      endDate: now.toISOString(),
      dataType: 'steps'
    });

    const calories = await CapacitorHealth.query({
      startDate: since.toISOString(),
      endDate: now.toISOString(),
      dataType: 'calories.active'
    });

    const heartRate = await CapacitorHealth.query({
      startDate: since.toISOString(),
      endDate: now.toISOString(),
      dataType: 'heart_rate'
    });

    const distance = await CapacitorHealth.query({
      startDate: since.toISOString(),
      endDate: now.toISOString(),
      dataType: 'distance'
    });

    // Agreg valorile
    const totalSteps = steps.reduce((s, e) => s + (e.value || 0), 0);
    const totalCal = Math.round(calories.reduce((s, e) => s + (e.value || 0), 0));
    const avgHR = heartRate.length
      ? Math.round(heartRate.reduce((s, e) => s + (e.value || 0), 0) / heartRate.length)
      : null;
    const totalDist = Math.round(distance.reduce((s, e) => s + (e.value || 0), 0));

    // Stocheaza in local storage (accesibil din app la deschidere)
    const existing = await CapacitorKV.get({ key: 'pendingHealthData' });
    const pending = existing.value ? JSON.parse(existing.value) : {
      steps: 0, calories: 0, heartRates: [], distance: 0,
      startTime: since.toISOString(), lastUpdate: now.toISOString()
    };

    pending.steps += totalSteps;
    pending.calories += totalCal;
    pending.distance += totalDist;
    if (avgHR) pending.heartRates.push(avgHR);
    pending.lastUpdate = now.toISOString();

    await CapacitorKV.set({ key: 'pendingHealthData', value: JSON.stringify(pending) });

    // Notificare dacă a inregistrat ceva semnificativ (>500 pasi in sesiune)
    if (totalSteps > 500) {
      await CapacitorNotifications.schedule([{
        id: 1001,
        title: 'Activitate înregistrată',
        body: totalSteps + ' pași · ' + (totalCal > 0 ? totalCal + ' kcal' : '') + ' — Deschide app pentru a salva',
        extra: { type: 'healthSync' }
      }]);
    }

    resolve();
  } catch (e) {
    // Health nu e autorizat sau platforma nu suporta — ignoram silentios
    resolve();
  }
});
