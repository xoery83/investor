export function temperatureParam(model: string, temperature: number) {
  return supportsCustomTemperature(model) ? { temperature } : {}
}

function supportsCustomTemperature(model: string) {
  return !model.toLowerCase().startsWith("gpt-5")
}
