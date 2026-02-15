/**
 * THEODORUS_P5.JS - Vers une Ingénierie Souveraine
 * -----------------------------------------------------------------------
 * * PHILOSOPHIE : 
 * Ce code illustre la Spirale de Théodorus où chaque triangle rectangle 
 * s'appuie sur une base constante de "1". 
 * - Le segment de 1 représente le Dividende Universel (DU) de la Monnaie Libre (Ğ1).
 * - L'hypoténuse qui s'étend (√n) représente la Masse Monétaire globale.
 * - L'absence de répétition des angles symbolise un système sans privilège.
 *
 * PROJET ASTROPORT : https://github.com/papiche/Astroport.ONE
 * VISION UNATION : https://ipfs.copylaradio.com/ipns/copylaradio.com/Unation.html
 *
 * CONTEXTE TECHNIQUE :
 * Inspiré par la fin du "Mur de Dijkstra" (Juillet 2025), ce script démontre
 * qu'une règle simple (KISS) génère une structure infinie et harmonieuse.
 * Ici, le DU est libéré pour devenir un point de vote vers les Biens Communs.
 * -----------------------------------------------------------------------
 * * UTILISATION :
 * 1. Inclure p5.js : <script src="p5.min.js"></script>
 * 2. Placer un container : <div id="canvas-container"></div>
 * 3. L'interaction se fait à la souris (X = Population, Y = Échelle).
 */

let maxIterations = 1;

function setup() {
  let canvas = createCanvas(windowWidth, 600);
  canvas.parent('canvas-container'); 
  colorMode(HSB, 360, 100, 100, 1);
}

function draw() {
  background(220, 10, 95); 
  translate(width / 2, height / 2);
  
  // Interaction : X contrôle le nombre de triangles, Y l'échelle
  maxIterations = floor(map(mouseX, 0, width, 1, 150));
  let dynamicScale = map(mouseY, 0, height, 80, 10);
  
  // Valeurs par défaut si souris hors canvas
  if (mouseX <= 0 || mouseX > width) maxIterations = 17; 
  if (mouseY <= 0 || mouseY > height) dynamicScale = 40;

  let angle = 0;
  
  for (let i = 1; i <= maxIterations; i++) {
    let hypotenuse = sqrt(i);
    let nextHypotenuse = sqrt(i + 1);
    let stepAngle = atan(1 / hypotenuse);
    
    let x1 = cos(angle) * hypotenuse * dynamicScale;
    let y1 = -sin(angle) * hypotenuse * dynamicScale;
    
    angle += stepAngle;
    
    let x2 = cos(angle) * nextHypotenuse * dynamicScale;
    let y2 = -sin(angle) * nextHypotenuse * dynamicScale;
    
    // Rendu esthétique
    stroke(220, 20, 20, 0.5);
    strokeWeight(1);
    fill((i * 5) % 360, 50, 80, 0.4);
    
    beginShape();
    vertex(0, 0);
    vertex(x1, y1);
    vertex(x2, y2);
    endShape(CLOSE);
    
    // Mise en évidence du DU (Le segment "Libre") sur la frontière
    if (i === maxIterations) {
      stroke(0, 100, 50); // Rouge vif
      strokeWeight(4);
      line(x1, y1, x2, y2); 
    }
  }
  
  resetMatrix();
  drawUI(maxIterations);
}

function drawUI(n) {
  noStroke();
  fill(220, 80, 20);
  textAlign(LEFT);
  textFont('Courier New');
  textSize(14);
  
  text(`[ SYSTEME MONETAIRE LIBRE ]`, 20, 30);
  text(`Membres (N) ............ ${n}`, 20, 55);
  text(`Masse Totale (√N) ...... √${n+1}`, 20, 75);
  
  // Rappel du DU
  fill(0, 100, 50);
  rect(20, 95, 10, 10);
  fill(220, 80, 20);
  text(`Dividende Universel (Base 1)`, 40, 105);
  
  textSize(11);
  text(`Explorez la vision sur copylaradio.com`, 20, height - 20);
}

function windowResized() {
  resizeCanvas(windowWidth, 600);
}
