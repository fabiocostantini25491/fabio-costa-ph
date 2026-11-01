/* Fabio Costa Ph — i18n.js
   Lingue del sito. Il sito è scritto in inglese: questo file traduce in automatico tutti i testi
   dell'interfaccia (anche quelli creati da mappe e strumenti) cercandoli nel dizionario qui sotto.
   I contenuti scritti da Fabio (viaggi, articoli, About) restano come sono stati scritti.
   Per aggiungere una traduzione: "Testo inglese esatto": ["italiano", "español", "français", "deutsch"]. */
"use strict";

const I18N = (() => {
  const LANGS = { en: "English", it: "Italiano", es: "Español", fr: "Français", de: "Deutsch" };
  const ORDER = ["it", "es", "fr", "de"];
  const LOCALES = { en: "en-GB", it: "it-IT", es: "es-ES", fr: "fr-FR", de: "de-DE" };
  const KEY = "fcph-lang";

  const pick = () => {
    try { const s = localStorage.getItem(KEY); if (LANGS[s]) return s; } catch {}
    const nav = (navigator.languages || [navigator.language || "en"]).map(l => String(l).slice(0, 2).toLowerCase());
    return nav.find(l => LANGS[l]) || "en";
  };
  const lang = pick();

  /* ---------- dizionario ---------- */
  const D = {
    // menu e intestazioni
    "HOME": ["HOME", "INICIO", "ACCUEIL", "START"],
    "EXPLORE": ["ESPLORA", "EXPLORAR", "EXPLORER", "ENTDECKEN"],
    "GALLERY": ["GALLERIA", "GALERÍA", "GALERIE", "GALERIE"],
    "JOURNAL": ["DIARIO", "DIARIO", "JOURNAL", "TAGEBUCH"],
    "TOOLS": ["STRUMENTI", "HERRAMIENTAS", "OUTILS", "TOOLS"],
    "SPOTS": ["SPOTS", "SPOTS", "SPOTS", "SPOTS"],
    "ABOUT": ["CHI SONO", "SOBRE MÍ", "À PROPOS", "ÜBER MICH"],
    "PHOTOGRAPHY · TRAVEL · EXPLORATION": ["FOTOGRAFIA · VIAGGI · ESPLORAZIONE", "FOTOGRAFÍA · VIAJES · EXPLORACIÓN", "PHOTOGRAPHIE · VOYAGE · EXPLORATION", "FOTOGRAFIE · REISEN · ENTDECKUNG"],
    "Photography · Travel · Exploration": ["Fotografia · Viaggi · Esplorazione", "Fotografía · Viajes · Exploración", "Photographie · Voyage · Exploration", "Fotografie · Reisen · Entdeckung"],
    "Field notes from planet Earth.": ["Appunti di viaggio dal pianeta Terra.", "Notas de campo desde el planeta Tierra.", "Carnets de terrain depuis la planète Terre.", "Notizen vom Planeten Erde."],
    "EXPLORE THE PLACES": ["ESPLORA I LUOGHI", "EXPLORA LOS LUGARES", "EXPLOREZ LES LIEUX", "ORTE ENTDECKEN"],
    "PHOTOGRAPHY": ["FOTOGRAFIA", "FOTOGRAFÍA", "PHOTOGRAPHIE", "FOTOGRAFIE"],
    "TRAVEL · EXPLORATION": ["VIAGGI · ESPLORAZIONE", "VIAJES · EXPLORACIÓN", "VOYAGE · EXPLORATION", "REISEN · ENTDECKUNG"],
    "A PHOTOGRAPHIC JOURNEY": ["UN VIAGGIO FOTOGRAFICO", "UN VIAJE FOTOGRÁFICO", "UN VOYAGE PHOTOGRAPHIQUE", "EINE FOTOGRAFISCHE REISE"],
    "The world, one place at a time.": ["Il mondo, un luogo alla volta.", "El mundo, un lugar a la vez.", "Le monde, un lieu à la fois.", "Die Welt, ein Ort nach dem anderen."],
    "Landscapes, cities and places worth remembering. Explore the map, discover the photographs and follow the stories of my journeys.": [
      "Paesaggi, città e luoghi da ricordare. Esplora la mappa, scopri le fotografie e segui i racconti dei miei viaggi.",
      "Paisajes, ciudades y lugares que merece la pena recordar. Explora el mapa, descubre las fotografías y sigue las historias de mis viajes.",
      "Paysages, villes et lieux qui méritent qu'on s'en souvienne. Explorez la carte, découvrez les photographies et suivez les récits de mes voyages.",
      "Landschaften, Städte und Orte, die man nicht vergisst. Entdecke die Karte, die Fotos und die Geschichten meiner Reisen."],
    "THE WORLD IS YOUR CANVAS": ["IL MONDO È LA TUA TELA", "EL MUNDO ES TU LIENZO", "LE MONDE EST VOTRE TOILE", "DIE WELT IST DEINE LEINWAND"],
    "Explore": ["Esplora", "Explorar", "Explorer", "Entdecken"],
    "Tap an astronaut on the map to open a journey, or search for a place by name.": [
      "Tocca un astronauta sulla mappa per aprire un viaggio, oppure cerca un luogo per nome.",
      "Toca un astronauta en el mapa para abrir un viaje o busca un lugar por su nombre.",
      "Touchez un astronaute sur la carte pour ouvrir un voyage, ou cherchez un lieu par son nom.",
      "Tippe auf einen Astronauten, um eine Reise zu öffnen, oder suche einen Ort nach Namen."],
    "Search a place": ["Cerca un luogo", "Buscar un lugar", "Chercher un lieu", "Ort suchen"],
    "SELECTED PHOTOGRAPHS": ["FOTOGRAFIE SCELTE", "FOTOGRAFÍAS SELECCIONADAS", "PHOTOGRAPHIES CHOISIES", "AUSGEWÄHLTE FOTOS"],
    "Gallery": ["Galleria", "Galería", "Galerie", "Galerie"],
    "Take your Jetpack and Explore": ["Prendi il tuo jetpack ed esplora", "Coge tu jetpack y explora", "Prends ton jetpack et explore", "Schnapp dir dein Jetpack und los"],
    "All": ["Tutte", "Todas", "Toutes", "Alle"],
    "Landscapes": ["Paesaggi", "Paisajes", "Paysages", "Landschaften"],
    "Urban": ["Urbano", "Urbano", "Urbain", "Stadt"],
    "No photographs match these filters yet.": ["Nessuna foto corrisponde a questi filtri.", "Ninguna foto coincide con estos filtros.", "Aucune photo ne correspond à ces filtres.", "Keine Fotos passen zu diesen Filtern."],
    "NOTES FROM THE ROAD": ["APPUNTI DALLA STRADA", "NOTAS DEL CAMINO", "NOTES DE ROUTE", "NOTIZEN VON UNTERWEGS"],
    "Journal": ["Diario", "Diario", "Journal", "Tagebuch"],
    "Travel stories, field notes and photographic inspiration.": ["Racconti di viaggio, appunti e ispirazione fotografica.", "Historias de viaje, notas y inspiración fotográfica.", "Récits de voyage, notes de terrain et inspiration photo.", "Reisegeschichten, Notizen und fotografische Inspiration."],
    "PLAN THE LIGHT": ["PIANIFICA LA LUCE", "PLANIFICA LA LUZ", "PLANIFIEZ LA LUMIÈRE", "PLANE DAS LICHT"],
    "Tools": ["Strumenti", "Herramientas", "Outils", "Tools"],
    "Plan the light: sun and moon times, a 3D planner with the real horizon, and a shooting plan from your test shot — wherever you are, or wherever you're going.": [
      "Pianifica la luce: orari di sole e luna, un planner 3D con l'orizzonte reale e un piano di scatto dalla tua foto di prova — dove sei o dove stai andando.",
      "Planifica la luz: horarios de sol y luna, un planificador 3D con el horizonte real y un plan de disparo a partir de tu foto de prueba — estés donde estés o vayas donde vayas.",
      "Planifiez la lumière : heures du soleil et de la lune, un planificateur 3D avec l'horizon réel et un plan de prise de vue à partir de votre photo test — où que vous soyez, où que vous alliez.",
      "Plane das Licht: Sonnen- und Mondzeiten, ein 3D-Planer mit echtem Horizont und ein Aufnahmeplan aus deinem Testfoto – wo du bist oder wohin du reist."],
    "MEMBERS ONLY": ["SOLO MEMBRI", "SOLO MIEMBROS", "RÉSERVÉ AUX MEMBRES", "NUR FÜR MITGLIEDER"],
    "Spots": ["Spots", "Spots", "Spots", "Spots"],
    "Photo spots, food, places to stay, workshops and trails — shared by members on one satellite map.": [
      "Spot fotografici, cibo, alloggi, workshop e sentieri — condivisi dai membri su un'unica mappa satellitare.",
      "Spots fotográficos, comida, alojamientos, talleres y rutas — compartidos por los miembros en un único mapa satelital.",
      "Spots photo, restaurants, hébergements, ateliers et randonnées — partagés par les membres sur une seule carte satellite.",
      "Fotospots, Essen, Unterkünfte, Workshops und Wanderwege – von Mitgliedern auf einer Satellitenkarte geteilt."],
    "BEHIND THE LENS": ["DIETRO L'OBIETTIVO", "DETRÁS DEL OBJETIVO", "DERRIÈRE L'OBJECTIF", "HINTER DER LINSE"],
    "About Me": ["Chi sono", "Sobre mí", "À propos", "Über mich"],
    "Photographer": ["Fotografo", "Fotógrafo", "Photographe", "Fotograf"],
    "My Gear": ["La mia attrezzatura", "Mi equipo", "Mon matériel", "Meine Ausrüstung"],
    "Search for a place or a photo": ["Cerca un luogo o una foto", "Busca un lugar o una foto", "Chercher un lieu ou une photo", "Ort oder Foto suchen"],
    "Open menu": ["Apri il menu", "Abrir menú", "Ouvrir le menu", "Menü öffnen"],
    "Language": ["Lingua", "Idioma", "Langue", "Sprache"],

    // home, explore, galleria, foto
    "Where I've been": ["Dove sono stato", "Dónde he estado", "Où je suis allé", "Wo ich war"],
    "Around the world": ["In giro per il mondo", "Alrededor del mundo", "Autour du monde", "Rund um die Welt"],
    "SELECT A LOCATION": ["SCEGLI UN LUOGO", "ELIGE UN LUGAR", "CHOISISSEZ UN LIEU", "WÄHLE EINEN ORT"],
    "Tap an astronaut on the map, or pick a journey from the list.": ["Tocca un astronauta sulla mappa o scegli un viaggio dalla lista.", "Toca un astronauta en el mapa o elige un viaje de la lista.", "Touchez un astronaute sur la carte ou choisissez un voyage dans la liste.", "Tippe auf einen Astronauten oder wähle eine Reise aus der Liste."],
    "The first journeys are coming soon.": ["I primi viaggi arriveranno presto.", "Los primeros viajes llegarán pronto.", "Les premiers voyages arrivent bientôt.", "Die ersten Reisen kommen bald."],
    "VIEW PHOTOS": ["VEDI LE FOTO", "VER FOTOS", "VOIR LES PHOTOS", "FOTOS ANSEHEN"],
    "VIEW THE JOURNEY ON THE MAP": ["VEDI IL VIAGGIO SULLA MAPPA", "VER EL VIAJE EN EL MAPA", "VOIR LE VOYAGE SUR LA CARTE", "REISE AUF DER KARTE"],
    "VIEW ON MAP": ["VEDI SULLA MAPPA", "VER EN EL MAPA", "VOIR SUR LA CARTE", "AUF DER KARTE"],
    "Photographs": ["Fotografie", "Fotografías", "Photographies", "Fotos"],
    "No photos here yet.": ["Ancora nessuna foto qui.", "Aún no hay fotos aquí.", "Pas encore de photos ici.", "Hier gibt es noch keine Fotos."],
    "PHOTO LOCATION": ["POSIZIONE DELLA FOTO", "UBICACIÓN DE LA FOTO", "LIEU DE LA PHOTO", "FOTOSTANDORT"],
    "This photo": ["Questa foto", "Esta foto", "Cette photo", "Dieses Foto"],
    "journey location": ["posizione del viaggio", "ubicación del viaje", "lieu du voyage", "Reiseort"],
    "Open in Google Maps": ["Apri in Google Maps", "Abrir en Google Maps", "Ouvrir dans Google Maps", "In Google Maps öffnen"],
    "Date not specified": ["Data non indicata", "Fecha no indicada", "Date non précisée", "Datum nicht angegeben"],
    "Dates not specified": ["Date non indicate", "Fechas no indicadas", "Dates non précisées", "Daten nicht angegeben"],
    "Close": ["Chiudi", "Cerrar", "Fermer", "Schließen"],
    "Close journey": ["Chiudi il viaggio", "Cerrar el viaje", "Fermer le voyage", "Reise schließen"],
    "Previous photo": ["Foto precedente", "Foto anterior", "Photo précédente", "Vorheriges Foto"],
    "Next photo": ["Foto successiva", "Foto siguiente", "Photo suivante", "Nächstes Foto"],
    "Full screen": ["Schermo intero", "Pantalla completa", "Plein écran", "Vollbild"],
    "Rotate photo": ["Ruota la foto", "Girar la foto", "Pivoter la photo", "Foto drehen"],
    "Hide details": ["Nascondi dettagli", "Ocultar detalles", "Masquer les détails", "Details ausblenden"],
    "Show details": ["Mostra dettagli", "Mostrar detalles", "Afficher les détails", "Details anzeigen"],
    "Show all my spots": ["Mostra tutti i miei luoghi", "Mostrar todos mis lugares", "Afficher tous mes lieux", "Alle meine Orte zeigen"],
    "Show all places": ["Mostra tutti i luoghi", "Mostrar todos los lugares", "Afficher tous les lieux", "Alle Orte zeigen"],
    "Zoom in": ["Ingrandisci", "Acercar", "Zoomer", "Vergrößern"],
    "Zoom out": ["Riduci", "Alejar", "Dézoomer", "Verkleinern"],
    "Satellite": ["Satellite", "Satélite", "Satellite", "Satellit"],
    "Terrain": ["Rilievo", "Relieve", "Relief", "Gelände"],
    "Map": ["Mappa", "Mapa", "Carte", "Karte"],
    "No articles yet.": ["Ancora nessun articolo.", "Aún no hay artículos.", "Pas encore d'articles.", "Noch keine Artikel."],
    "Type the name of a place, a journey or a photo.": ["Scrivi il nome di un luogo, di un viaggio o di una foto.", "Escribe el nombre de un lugar, un viaje o una foto.", "Tapez le nom d'un lieu, d'un voyage ou d'une photo.", "Gib den Namen eines Ortes, einer Reise oder eines Fotos ein."],
    "The site content could not be loaded. Please reload the page.": ["Non è stato possibile caricare i contenuti. Ricarica la pagina.", "No se pudo cargar el contenido. Vuelve a cargar la página.", "Le contenu n'a pas pu être chargé. Rechargez la page.", "Inhalte konnten nicht geladen werden. Bitte Seite neu laden."],

    // licenze e selezione
    "Interested in this photo?": ["Ti interessa questa foto?", "¿Te interesa esta foto?", "Cette photo vous intéresse ?", "Interesse an diesem Foto?"],
    "Add to selection": ["Aggiungi alla selezione", "Añadir a la selección", "Ajouter à la sélection", "Zur Auswahl hinzufügen"],
    "In your selection": ["Nella tua selezione", "En tu selección", "Dans votre sélection", "In deiner Auswahl"],
    "Add to your selection": ["Aggiungi alla tua selezione", "Añadir a tu selección", "Ajouter à votre sélection", "Zu deiner Auswahl hinzufügen"],
    "Prints, licensing or a special use?": ["Stampe, licenze o un uso speciale?", "¿Copias, licencias o un uso especial?", "Tirages, licences ou un usage particulier ?", "Drucke, Lizenzen oder eine besondere Nutzung?"],
    "Email me": ["Scrivimi", "Escríbeme", "Écrivez-moi", "Schreib mir"],
    "Message on Instagram": ["Scrivimi su Instagram", "Escríbeme en Instagram", "Message sur Instagram", "Nachricht auf Instagram"],
    "in your selection": ["nella tua selezione", "en tu selección", "dans votre sélection", "in deiner Auswahl"],
    "Clear": ["Svuota", "Vaciar", "Vider", "Leeren"],
    "REQUEST LICENCE OR PRINTS": ["RICHIEDI LICENZA O STAMPE", "SOLICITAR LICENCIA O COPIAS", "DEMANDER LICENCE OU TIRAGES", "LIZENZ ODER DRUCKE ANFRAGEN"],
    "Licensing & prints": ["Licenze e stampe", "Licencias y copias", "Licences et tirages", "Lizenzen & Drucke"],
    "Your selection": ["La tua selezione", "Tu selección", "Votre sélection", "Deine Auswahl"],
    "What would you like?": ["Cosa ti interessa?", "¿Qué te interesa?", "Que souhaitez-vous ?", "Was möchtest du?"],
    "Fine-art prints": ["Stampe fine art", "Copias fine art", "Tirages d'art", "Fine-Art-Drucke"],
    "Editorial licence": ["Licenza editoriale", "Licencia editorial", "Licence éditoriale", "Redaktionelle Lizenz"],
    "Commercial licence": ["Licenza commerciale", "Licencia comercial", "Licence commerciale", "Kommerzielle Lizenz"],
    "Not sure yet": ["Non so ancora", "Aún no lo sé", "Je ne sais pas encore", "Noch unsicher"],
    "Anything else?": ["Altro?", "¿Algo más?", "Autre chose ?", "Sonst noch etwas?"],
    "(sizes, quantity, where you'd use them…)": ["(formati, quantità, dove le useresti…)", "(tamaños, cantidad, dónde las usarías…)", "(formats, quantité, utilisation prévue…)", "(Formate, Menge, Verwendungszweck…)"],
    "Send by email": ["Invia per email", "Enviar por email", "Envoyer par email", "Per E-Mail senden"],
    "Send on Instagram": ["Invia su Instagram", "Enviar por Instagram", "Envoyer sur Instagram", "Über Instagram senden"],

    // strumenti: sole e luna
    "Sun & Moon": ["Sole e luna", "Sol y luna", "Soleil et lune", "Sonne & Mond"],
    "Planner": ["Planner", "Planificador", "Planificateur", "Planer"],
    "Analyze your shot": ["Analizza il tuo scatto", "Analiza tu foto", "Analysez votre photo", "Foto analysieren"],
    "Search a place…": ["Cerca un luogo…", "Busca un lugar…", "Chercher un lieu…", "Ort suchen…"],
    "Near me": ["Vicino a me", "Cerca de mí", "Près de moi", "In meiner Nähe"],
    "Use my location": ["Usa la mia posizione", "Usar mi ubicación", "Utiliser ma position", "Meinen Standort verwenden"],
    "Today": ["Oggi", "Hoy", "Aujourd'hui", "Heute"],
    "Previous day": ["Giorno precedente", "Día anterior", "Jour précédent", "Vorheriger Tag"],
    "Next day": ["Giorno successivo", "Día siguiente", "Jour suivant", "Nächster Tag"],
    "Previous month": ["Mese precedente", "Mes anterior", "Mois précédent", "Vorheriger Monat"],
    "Next month": ["Mese successivo", "Mes siguiente", "Mois suivant", "Nächster Monat"],
    "The sun": ["Il sole", "El sol", "Le soleil", "Die Sonne"],
    "Light of the day": ["La luce del giorno", "La luz del día", "La lumière du jour", "Das Licht des Tages"],
    "Twilight": ["Crepuscolo", "Crepúsculo", "Crépuscule", "Dämmerung"],
    "Blue hour": ["Ora blu", "Hora azul", "Heure bleue", "Blaue Stunde"],
    "Golden hour": ["Ora d'oro", "Hora dorada", "Heure dorée", "Goldene Stunde"],
    "Daylight": ["Giorno", "Luz del día", "Plein jour", "Tageslicht"],
    "Morning": ["Mattina", "Mañana", "Matin", "Morgen"],
    "Evening": ["Sera", "Tarde", "Soir", "Abend"],
    "Astronomical dawn": ["Alba astronomica", "Amanecer astronómico", "Aube astronomique", "Astronomische Morgendämmerung"],
    "Nautical dawn": ["Alba nautica", "Amanecer náutico", "Aube nautique", "Nautische Morgendämmerung"],
    "Sunrise": ["Alba", "Salida del sol", "Lever du soleil", "Sonnenaufgang"],
    "Sunset": ["Tramonto", "Puesta de sol", "Coucher du soleil", "Sonnenuntergang"],
    "Nautical dusk": ["Crepuscolo nautico", "Anochecer náutico", "Crépuscule nautique", "Nautische Abenddämmerung"],
    "Astronomical dusk": ["Crepuscolo astronomico", "Anochecer astronómico", "Crépuscule astronomique", "Astronomische Abenddämmerung"],
    "Clouds at sunrise": ["Nuvole all'alba", "Nubes al amanecer", "Nuages au lever", "Wolken bei Sonnenaufgang"],
    "Clouds at sunset": ["Nuvole al tramonto", "Nubes al atardecer", "Nuages au coucher", "Wolken bei Sonnenuntergang"],
    "Solar noon": ["Mezzogiorno solare", "Mediodía solar", "Midi solaire", "Sonnenmittag"],
    "Day length": ["Durata del giorno", "Duración del día", "Durée du jour", "Tageslänge"],
    "The moon": ["La luna", "La luna", "La lune", "Der Mond"],
    "New Moon": ["Luna nuova", "Luna nueva", "Nouvelle lune", "Neumond"],
    "Waxing Crescent": ["Luna crescente", "Luna creciente", "Premier croissant", "Zunehmende Sichel"],
    "First Quarter": ["Primo quarto", "Cuarto creciente", "Premier quartier", "Erstes Viertel"],
    "Waxing Gibbous": ["Gibbosa crescente", "Gibosa creciente", "Gibbeuse croissante", "Zunehmender Mond"],
    "Full Moon": ["Luna piena", "Luna llena", "Pleine lune", "Vollmond"],
    "Waning Gibbous": ["Gibbosa calante", "Gibosa menguante", "Gibbeuse décroissante", "Abnehmender Mond"],
    "Last Quarter": ["Ultimo quarto", "Cuarto menguante", "Dernier quartier", "Letztes Viertel"],
    "Waning Crescent": ["Luna calante", "Luna menguante", "Dernier croissant", "Abnehmende Sichel"],
    "illuminated": ["illuminata", "iluminada", "éclairée", "beleuchtet"],
    "Moonrise": ["Sorge la luna", "Salida de la luna", "Lever de lune", "Mondaufgang"],
    "Moonset": ["Tramonta la luna", "Puesta de la luna", "Coucher de lune", "Monduntergang"],
    "Next full moon": ["Prossima luna piena", "Próxima luna llena", "Prochaine pleine lune", "Nächster Vollmond"],
    "Next new moon": ["Prossima luna nuova", "Próxima luna nueva", "Prochaine nouvelle lune", "Nächster Neumond"],
    "Up all day": ["Visibile tutto il giorno", "Visible todo el día", "Visible toute la journée", "Den ganzen Tag sichtbar"],
    "Doesn't rise": ["Non sorge", "No sale", "Ne se lève pas", "Geht nicht auf"],
    "Night sky": ["Cielo notturno", "Cielo nocturno", "Ciel nocturne", "Nachthimmel"],
    "Tonight": ["Stanotte", "Esta noche", "Cette nuit", "Heute Nacht"],
    "Dark sky": ["Cielo buio", "Cielo oscuro", "Ciel noir", "Dunkler Himmel"],
    "Partly dark": ["In parte buio", "Parcialmente oscuro", "Partiellement noir", "Teilweise dunkel"],
    "Bright moon": ["Luna luminosa", "Luna brillante", "Lune brillante", "Heller Mond"],
    "No full darkness": ["Mai completamente buio", "Sin oscuridad total", "Pas d'obscurité totale", "Keine volle Dunkelheit"],
    "A dark night: plenty of time without sunlight or moonlight. Great for stars.": ["Una notte buia: molto tempo senza luce del sole né della luna. Perfetta per le stelle.", "Una noche oscura: mucho tiempo sin luz del sol ni de la luna. Ideal para las estrellas.", "Une nuit noire : beaucoup de temps sans soleil ni lune. Idéal pour les étoiles.", "Eine dunkle Nacht: viel Zeit ohne Sonnen- und Mondlicht. Ideal für Sterne."],
    "Some dark hours tonight, between twilight and the moon.": ["Qualche ora di buio stanotte, tra il crepuscolo e la luna.", "Algunas horas oscuras esta noche, entre el crepúsculo y la luna.", "Quelques heures noires cette nuit, entre le crépuscule et la lune.", "Ein paar dunkle Stunden heute Nacht, zwischen Dämmerung und Mond."],
    "The moon lights up most of the night. Better for moonlit landscapes than for stars.": ["La luna illumina quasi tutta la notte. Meglio per paesaggi al chiaro di luna che per le stelle.", "La luna ilumina casi toda la noche. Mejor para paisajes a la luz de la luna que para estrellas.", "La lune éclaire la plus grande partie de la nuit. Mieux pour des paysages au clair de lune que pour les étoiles.", "Der Mond erhellt fast die ganze Nacht. Besser für Mondlandschaften als für Sterne."],
    "Dark sky (no sun, no moon)": ["Cielo buio (senza sole né luna)", "Cielo oscuro (sin sol ni luna)", "Ciel noir (sans soleil ni lune)", "Dunkler Himmel (ohne Sonne und Mond)"],
    "Total darkness": ["Buio totale", "Oscuridad total", "Obscurité totale", "Gesamte Dunkelheit"],
    "Milky Way core visible": ["Nucleo della Via Lattea visibile", "Núcleo de la Vía Láctea visible", "Cœur de la Voie lactée visible", "Milchstraßenkern sichtbar"],
    "Moon calendar": ["Calendario lunare", "Calendario lunar", "Calendrier lunaire", "Mondkalender"],
    "Mon": ["Lun", "Lun", "Lun", "Mo"], "Tue": ["Mar", "Mar", "Mar", "Di"], "Wed": ["Mer", "Mié", "Mer", "Mi"], "Thu": ["Gio", "Jue", "Jeu", "Do"],
    "Fri": ["Ven", "Vie", "Ven", "Fr"], "Sat": ["Sab", "Sáb", "Sam", "Sa"], "Sun": ["Dom", "Dom", "Dim", "So"],
    "Dark night (3 h+ without sun and moon)": ["Notte buia (3 h+ senza sole e luna)", "Noche oscura (3 h+ sin sol ni luna)", "Nuit noire (3 h+ sans soleil ni lune)", "Dunkle Nacht (3 h+ ohne Sonne und Mond)"],
    "Milky Way core visible 1 h+": ["Nucleo della Via Lattea visibile 1 h+", "Núcleo de la Vía Láctea visible 1 h+", "Cœur de la Voie lactée visible 1 h+", "Milchstraßenkern 1 h+ sichtbar"],
    "Your position": ["La tua posizione", "Tu posición", "Votre position", "Dein Standort"],
    "Calculating…": ["Calcolo in corso…", "Calculando…", "Calcul…", "Berechnung…"],

    // planner
    "Look at sunrise": ["Guarda l'alba", "Mirar el amanecer", "Vers le lever", "Zum Sonnenaufgang"],
    "Look at sunset": ["Guarda il tramonto", "Mirar el atardecer", "Vers le coucher", "Zum Sonnenuntergang"],
    "Look at Milky Way": ["Guarda la Via Lattea", "Mirar la Vía Láctea", "Vers la Voie lactée", "Zur Milchstraße"],
    "Sun now": ["Sole ora", "Sol ahora", "Soleil maintenant", "Sonne jetzt"],
    "Moonrise/set": ["Sorgere/tramonto luna", "Salida/puesta luna", "Lever/coucher lune", "Mondauf-/untergang"],
    "Moon now": ["Luna ora", "Luna ahora", "Lune maintenant", "Mond jetzt"],
    "Milky Way core": ["Nucleo della Via Lattea", "Núcleo de la Vía Láctea", "Cœur de la Voie lactée", "Milchstraßenkern"],
    "Tap the map or drag the pin to choose your shooting point. In 3D, drag with two fingers (or right-click) to tilt and rotate.": [
      "Tocca la mappa o trascina il segnaposto per scegliere il punto di scatto. In 3D, trascina con due dita (o con il tasto destro) per inclinare e ruotare.",
      "Toca el mapa o arrastra el marcador para elegir tu punto de disparo. En 3D, arrastra con dos dedos (o clic derecho) para inclinar y girar.",
      "Touchez la carte ou déplacez le repère pour choisir votre point de vue. En 3D, glissez à deux doigts (ou clic droit) pour incliner et pivoter.",
      "Tippe auf die Karte oder ziehe die Markierung, um deinen Standort zu wählen. In 3D mit zwei Fingern (oder Rechtsklick) neigen und drehen."],
    "Now": ["Ora", "Ahora", "Maintenant", "Jetzt"],
    "Slow": ["Lento", "Lento", "Lent", "Langsam"], "Normal": ["Normale", "Normal", "Normal", "Normal"], "Fast": ["Veloce", "Rápido", "Rapide", "Schnell"],
    "Sun": ["Sole", "Sol", "Soleil", "Sonne"], "Moon": ["Luna", "Luna", "Lune", "Mond"],
    "Milky Way": ["Via Lattea", "Vía Láctea", "Voie lactée", "Milchstraße"],
    "Constellation": ["Costellazione", "Constelación", "Constellation", "Sternbild"],
    "Directions": ["Direzioni", "Direcciones", "Directions", "Richtungen"],
    "Year paths": ["Percorsi dell'anno", "Trayectorias del año", "Trajectoires de l'année", "Jahresbahnen"],
    "Sky view from the pin": ["Il cielo visto dal punto scelto", "El cielo desde el punto", "Le ciel depuis le repère", "Himmel vom Standort"],
    "Watch the sky move": ["Guarda il cielo muoversi", "Mira cómo se mueve el cielo", "Regardez le ciel bouger", "Sieh den Himmel wandern"],
    "Follow the action": ["Segui l'azione", "Seguir la acción", "Suivre l'action", "Dem Geschehen folgen"],
    "Direction": ["Direzione", "Dirección", "Direction", "Richtung"],
    "Height": ["Altezza", "Altura", "Hauteur", "Höhe"],
    "Light": ["Luce", "Luz", "Lumière", "Licht"],
    "Illuminated": ["Illuminata", "Iluminada", "Éclairée", "Beleuchtet"],
    "Visible": ["Visibile", "Visible", "Visible", "Sichtbar"],
    "Yes": ["Sì", "Sí", "Oui", "Ja"],
    "Yes, but moonlit": ["Sì, ma con la luna", "Sí, pero con luna", "Oui, mais avec la lune", "Ja, aber mit Mondlicht"],
    "Below the horizon": ["Sotto l'orizzonte", "Bajo el horizonte", "Sous l'horizon", "Unter dem Horizont"],
    "Sky too bright": ["Cielo troppo chiaro", "Cielo demasiado claro", "Ciel trop clair", "Himmel zu hell"],
    "Too low": ["Troppo basso", "Demasiado bajo", "Trop bas", "Zu niedrig"],
    "Night": ["Notte", "Noche", "Nuit", "Nacht"],
    "Nautical twilight": ["Crepuscolo nautico", "Crepúsculo náutico", "Crépuscule nautique", "Nautische Dämmerung"],
    "Astronomical twilight": ["Crepuscolo astronomico", "Crepúsculo astronómico", "Crépuscule astronomique", "Astronomische Dämmerung"],
    "Constellations": ["Costellazioni", "Constelaciones", "Constellations", "Sternbilder"],
    "When to see them": ["Quando vederle", "Cuándo verlas", "Quand les voir", "Wann man sie sieht"],
    "None": ["Nessuna", "Ninguna", "Aucune", "Keins"],
    "Rises": ["Sorge", "Sale", "Se lève", "Geht auf"],
    "Sets": ["Tramonta", "Se pone", "Se couche", "Geht unter"],
    "Best moment (highest in the dark)": ["Momento migliore (più alta al buio)", "Mejor momento (más alta en la oscuridad)", "Meilleur moment (au plus haut dans la nuit)", "Bester Moment (am höchsten im Dunkeln)"],
    "Well visible in a dark sky": ["Ben visibile a cielo buio", "Bien visible con cielo oscuro", "Bien visible dans un ciel noir", "Gut sichtbar bei dunklem Himmel"],
    "not tonight": ["non stanotte", "no esta noche", "pas cette nuit", "nicht heute Nacht"],
    "Real horizon": ["Orizzonte reale", "Horizonte real", "Horizon réel", "Echter Horizont"],
    "Mountains, hills and the light": ["Montagne, colline e luce", "Montañas, colinas y luz", "Montagnes, collines et lumière", "Berge, Hügel und Licht"],
    "Sun appears over the terrain": ["Il sole spunta dal rilievo", "El sol aparece sobre el relieve", "Le soleil apparaît au-dessus du relief", "Sonne erscheint über dem Gelände"],
    "Sun disappears behind the terrain": ["Il sole sparisce dietro il rilievo", "El sol desaparece tras el relieve", "Le soleil disparaît derrière le relief", "Sonne verschwindet hinter dem Gelände"],
    "Moon appears": ["La luna spunta", "La luna aparece", "La lune apparaît", "Mond erscheint"],
    "Moon disappears": ["La luna sparisce", "La luna desaparece", "La lune disparaît", "Mond verschwindet"],
    "Milky Way core above the skyline, dark sky": ["Nucleo della Via Lattea sopra il profilo, cielo buio", "Núcleo de la Vía Láctea sobre el perfil, cielo oscuro", "Cœur de la Voie lactée au-dessus de l'horizon, ciel noir", "Milchstraßenkern über der Silhouette, dunkler Himmel"],
    "Orion": ["Orione", "Orión", "Orion", "Orion"], "Big Dipper": ["Grande Carro", "Osa Mayor", "Grande Ourse", "Großer Wagen"],
    "Cassiopeia": ["Cassiopea", "Casiopea", "Cassiopée", "Kassiopeia"], "Scorpius": ["Scorpione", "Escorpio", "Scorpion", "Skorpion"],
    "Cygnus (Northern Cross)": ["Cigno (Croce del Nord)", "Cisne (Cruz del Norte)", "Cygne (Croix du Nord)", "Schwan (Kreuz des Nordens)"],
    "Pleiades": ["Pleiadi", "Pléyades", "Pléiades", "Plejaden"], "Southern Cross": ["Croce del Sud", "Cruz del Sur", "Croix du Sud", "Kreuz des Südens"],
    "Polaris (North Star)": ["Polare (Stella Polare)", "Polaris (Estrella Polar)", "Polaris (Étoile polaire)", "Polaris (Polarstern)"],

    // analizza lo scatto
    "Take a test shot, get a shooting plan": ["Fai uno scatto di prova, ricevi un piano di scatto", "Haz una foto de prueba y recibe un plan de disparo", "Prenez une photo test, recevez un plan de prise de vue", "Mach ein Testfoto, erhalte einen Aufnahmeplan"],
    "Choose a test shot": ["Scegli uno scatto di prova", "Elige una foto de prueba", "Choisissez une photo test", "Testfoto wählen"],
    "Burnt highlights": ["Luci bruciate", "Luces quemadas", "Hautes lumières brûlées", "Ausgebrannte Lichter"],
    "Black shadows": ["Ombre nere", "Sombras negras", "Ombres bouchées", "Schwarze Schatten"],
    "Noise in the dark areas": ["Rumore nelle zone scure", "Ruido en las zonas oscuras", "Bruit dans les zones sombres", "Rauschen in dunklen Bereichen"],
    "Low": ["Basso", "Bajo", "Faible", "Niedrig"], "Medium": ["Medio", "Medio", "Moyen", "Mittel"], "High": ["Alto", "Alto", "Élevé", "Hoch"],
    "On a tripod": ["Su treppiede", "Con trípode", "Sur trépied", "Auf Stativ"],
    "Your shooting plan": ["Il tuo piano di scatto", "Tu plan de disparo", "Votre plan de prise de vue", "Dein Aufnahmeplan"],
    "Here's what to do": ["Ecco cosa fare", "Esto es lo que debes hacer", "Voici quoi faire", "So gehst du vor"],
    "Tips for this scene": ["Consigli per questa scena", "Consejos para esta escena", "Conseils pour cette scène", "Tipps für diese Szene"],
    "Exposure": ["Esposizione", "Exposición", "Exposition", "Belichtung"], "Sharp stars": ["Stelle nitide", "Estrellas nítidas", "Étoiles nettes", "Scharfe Sterne"],
    "Bracketing": ["Bracketing", "Horquillado", "Bracketing", "Belichtungsreihe"], "Stacking": ["Stacking", "Apilado", "Empilement", "Stacking"],
    "Foreground": ["Primo piano", "Primer plano", "Premier plan", "Vordergrund"], "Focus": ["Messa a fuoco", "Enfoque", "Mise au point", "Fokus"],
    "White balance": ["Bilanciamento del bianco", "Balance de blancos", "Balance des blancs", "Weißabgleich"], "Noise": ["Rumore", "Ruido", "Bruit", "Rauschen"],
    "Long exposure": ["Lunga esposizione", "Larga exposición", "Pose longue", "Langzeitbelichtung"], "Star trails": ["Star trail", "Trazos de estrellas", "Filés d'étoiles", "Sternspuren"],
    "Village or town at night": ["Borgo o città di notte", "Pueblo o ciudad de noche", "Village ou ville la nuit", "Dorf oder Stadt bei Nacht"],
    "City at night": ["Città di notte", "Ciudad de noche", "Ville la nuit", "Stadt bei Nacht"],
    "Sunset or sunrise": ["Tramonto o alba", "Atardecer o amanecer", "Coucher ou lever de soleil", "Sonnenunter- oder -aufgang"],
    "Moonlit landscape": ["Paesaggio al chiaro di luna", "Paisaje a la luz de la luna", "Paysage au clair de lune", "Mondlandschaft"],
    "Northern lights": ["Aurora boreale", "Auroras boreales", "Aurores boréales", "Polarlichter"],
    "Landscape by day": ["Paesaggio di giorno", "Paisaje de día", "Paysage de jour", "Landschaft bei Tag"],
    "Waterfall / long exposure": ["Cascata / lunga esposizione", "Cascada / larga exposición", "Cascade / pose longue", "Wasserfall / Langzeitbelichtung"],
    "The overall exposure is about right for this kind of scene.": ["L'esposizione generale va bene per questo tipo di scena.", "La exposición general es adecuada para este tipo de escena.", "L'exposition générale convient à ce type de scène.", "Die Gesamtbelichtung passt für diese Art von Szene."],

    // SPOTS: accesso e barra
    "Members only": ["Solo per i membri", "Solo para miembros", "Réservé aux membres", "Nur für Mitglieder"],
    "Email": ["Email", "Email", "Email", "E-Mail"], "Password": ["Password", "Contraseña", "Mot de passe", "Passwort"],
    "LOG IN": ["ACCEDI", "ENTRAR", "CONNEXION", "ANMELDEN"], "Log in": ["Accedi", "Entrar", "Se connecter", "Anmelden"], "Log out": ["Esci", "Salir", "Se déconnecter", "Abmelden"],
    "Members: log in": ["Membri: accedi", "Miembros: entrar", "Membres : connexion", "Mitglieder: anmelden"],
    "← Back to the public map": ["← Torna alla mappa pubblica", "← Volver al mapa público", "← Retour à la carte publique", "← Zurück zur öffentlichen Karte"],
    "Wrong email or password.": ["Email o password errate.", "Email o contraseña incorrectos.", "Email ou mot de passe incorrect.", "E-Mail oder Passwort falsch."],
    "Logging in…": ["Accesso in corso…", "Entrando…", "Connexion…", "Anmeldung…"],
    "Loading the map…": ["Caricamento della mappa…", "Cargando el mapa…", "Chargement de la carte…", "Karte wird geladen…"],
    "Search a spot or a place…": ["Cerca uno spot o un luogo…", "Busca un spot o un lugar…", "Chercher un spot ou un lieu…", "Spot oder Ort suchen…"],
    "Add a place": ["Aggiungi un posto", "Añadir un lugar", "Ajouter un lieu", "Ort hinzufügen"],
    "Everything": ["Tutto", "Todo", "Tout", "Alles"],
    "Photo spots": ["Spot fotografici", "Spots fotográficos", "Spots photo", "Fotospots"],
    "Food & drink": ["Mangiare e bere", "Comer y beber", "Manger et boire", "Essen & Trinken"],
    "Stay": ["Dormire", "Alojamiento", "Hébergement", "Unterkunft"],
    "Workshops": ["Workshop", "Talleres", "Ateliers", "Workshops"], "Trekking": ["Trekking", "Senderismo", "Randonnée", "Wandern"],
    "Alerts: show": ["Avvisi: mostra", "Avisos: mostrar", "Alertes : afficher", "Hinweise: anzeigen"],
    "Hide places with alerts": ["Nascondi i posti con avvisi", "Ocultar lugares con avisos", "Masquer les lieux avec alertes", "Orte mit Hinweisen ausblenden"],
    "Only places with alerts": ["Solo i posti con avvisi", "Solo lugares con avisos", "Seulement les lieux avec alertes", "Nur Orte mit Hinweisen"],
    "Community code": ["Codice della community", "Código de la comunidad", "Code de la communauté", "Community-Kodex"],
    "Scan this area": ["Esplora quest'area", "Explorar esta zona", "Scanner cette zone", "Gebiet durchsuchen"],
    "Before you go": ["Prima di partire", "Antes de ir", "Avant de partir", "Bevor du losgehst"],
    "Photo terms": ["Condizioni sulle foto", "Condiciones de las fotos", "Conditions des photos", "Fotobedingungen"],
    "From the community": ["Dalla community", "De la comunidad", "De la communauté", "Aus der Community"],
    "Also around, from OpenStreetMap": ["Nei dintorni, da OpenStreetMap", "Alrededor, desde OpenStreetMap", "Aux alentours, depuis OpenStreetMap", "In der Nähe, aus OpenStreetMap"],
    "on map": ["sulla mappa", "en el mapa", "sur la carte", "auf der Karte"],
    "Within": ["Entro", "En un radio de", "Dans un rayon de", "Im Umkreis"],
    "Near you": ["Vicino a te", "Cerca de ti", "Près de vous", "In deiner Nähe"],
    "What's around you": ["Cosa c'è intorno a te", "Qué hay a tu alrededor", "Ce qu'il y a autour de vous", "Was es um dich herum gibt"],
    "Around": ["Intorno a", "Alrededor de", "Autour de", "Rund um"],
    "This area": ["Quest'area", "Esta zona", "Cette zone", "Dieses Gebiet"],
    "Viewpoint": ["Punto panoramico", "Mirador", "Point de vue", "Aussichtspunkt"], "Peak": ["Cima", "Cumbre", "Sommet", "Gipfel"],
    "Waterfall": ["Cascata", "Cascada", "Cascade", "Wasserfall"], "Nature": ["Natura", "Naturaleza", "Nature", "Natur"],
    "Castle & tower": ["Castelli e torri", "Castillos y torres", "Châteaux et tours", "Burgen & Türme"],
    "Ruins & archaeology": ["Rovine e archeologia", "Ruinas y arqueología", "Ruines et archéologie", "Ruinen & Archäologie"],
    "Church & abbey": ["Chiese e abbazie", "Iglesias y abadías", "Églises et abbayes", "Kirchen & Abteien"],
    "Landmark": ["Monumento", "Monumento", "Monument", "Wahrzeichen"], "Attraction": ["Attrazione", "Atracción", "Attraction", "Sehenswürdigkeit"],
    "Hut & camp": ["Rifugi e campeggi", "Refugios y campings", "Refuges et campings", "Hütten & Camping"],
    "Free entry": ["Ingresso gratuito", "Entrada gratuita", "Entrée gratuite", "Eintritt frei"], "Ticket required": ["Serve il biglietto", "Se necesita entrada", "Billet nécessaire", "Ticket erforderlich"],
    "Check tickets & access": ["Verifica biglietti e accesso", "Consultar entradas y acceso", "Vérifier billets et accès", "Tickets & Zugang prüfen"],
    "Official website": ["Sito ufficiale", "Web oficial", "Site officiel", "Offizielle Website"],
    "View on OpenStreetMap": ["Vedi su OpenStreetMap", "Ver en OpenStreetMap", "Voir sur OpenStreetMap", "Auf OpenStreetMap ansehen"],
    "Add to community spots": ["Aggiungi agli spot della community", "Añadir a los spots de la comunidad", "Ajouter aux spots de la communauté", "Zu den Community-Spots hinzufügen"],
    "Approximate area (about 1 km)": ["Zona approssimativa (circa 1 km)", "Zona aproximada (aprox. 1 km)", "Zone approximative (environ 1 km)", "Ungefähres Gebiet (ca. 1 km)"],
    "Copy": ["Copia", "Copiar", "Copier", "Kopieren"], "Copied": ["Copiato", "Copiado", "Copié", "Kopiert"],
    "Add photo": ["Aggiungi foto", "Añadir foto", "Ajouter une photo", "Foto hinzufügen"], "Review": ["Recensione", "Reseña", "Avis", "Bewertung"],
    "Edit review": ["Modifica recensione", "Editar reseña", "Modifier l'avis", "Bewertung bearbeiten"],
    "Post review": ["Pubblica recensione", "Publicar reseña", "Publier l'avis", "Bewertung veröffentlichen"],
    "Report": ["Segnala", "Avisar", "Signaler", "Melden"], "Community settings": ["Impostazioni community", "Ajustes de comunidad", "Réglages communauté", "Community-Einstellungen"],
    "Send report": ["Invia segnalazione", "Enviar aviso", "Envoyer le signalement", "Meldung senden"],
    "Still valid": ["Ancora valida", "Sigue vigente", "Toujours valable", "Noch gültig"], "Not valid anymore": ["Non più valida", "Ya no es válida", "Plus valable", "Nicht mehr gültig"],
    "Closed": ["Chiuso", "Cerrado", "Fermé", "Geschlossen"], "Works or landslide": ["Lavori o frana", "Obras o derrumbe", "Travaux ou éboulement", "Bauarbeiten oder Erdrutsch"],
    "Event on": ["Evento in corso", "Evento en curso", "Événement en cours", "Veranstaltung"], "Very crowded": ["Molto affollato", "Muy concurrido", "Très fréquenté", "Sehr überfüllt"],
    "Danger": ["Pericolo", "Peligro", "Danger", "Gefahr"], "Access changed": ["Accesso cambiato", "Acceso cambiado", "Accès modifié", "Zugang geändert"],
    "Delete": ["Elimina", "Eliminar", "Supprimer", "Löschen"], "Confirm delete": ["Conferma eliminazione", "Confirmar eliminación", "Confirmer la suppression", "Löschen bestätigen"],
    "Save": ["Salva", "Guardar", "Enregistrer", "Speichern"], "Saved.": ["Salvato.", "Guardado.", "Enregistré.", "Gespeichert."],
    "Eat & sleep nearby": ["Mangiare e dormire vicino", "Comer y dormir cerca", "Manger et dormir à proximité", "Essen & Schlafen in der Nähe"],
    "Our code": ["Il nostro codice", "Nuestro código", "Notre code", "Unser Kodex"],
    "I AGREE": ["ACCETTO", "ACEPTO", "J'ACCEPTE", "ICH STIMME ZU"],
    "Try again": ["Riprova", "Reintentar", "Réessayer", "Erneut versuchen"],
    "Member": ["Membro", "Miembro", "Membre", "Mitglied"],
    "Join — it's free": ["Iscriviti — è gratis", "Únete — es gratis", "S'inscrire — c'est gratuit", "Beitreten — kostenlos"],
    "Join free": ["Iscriviti gratis", "Únete gratis", "Inscription gratuite", "Kostenlos beitreten"],
    "JOIN FREE": ["ISCRIVITI GRATIS", "ÚNETE GRATIS", "INSCRIPTION GRATUITE", "KOSTENLOS BEITRETEN"],
    "JOIN": ["ISCRIVITI", "ÚNETE", "S'INSCRIRE", "BEITRETEN"],
    "First name": ["Nome", "Nombre", "Prénom", "Vorname"], "Last name": ["Cognome", "Apellidos", "Nom", "Nachname"],
    "At least 8 characters": ["Almeno 8 caratteri", "Al menos 8 caracteres", "Au moins 8 caractères", "Mindestens 8 Zeichen"],
    "I accept the": ["Accetto il", "Acepto el", "J'accepte le", "Ich akzeptiere den"],
    "community code": ["codice della community", "código de la comunidad", "code de la communauté", "Community-Kodex"],
    "and the terms below the map.": ["e le condizioni sotto la mappa.", "y las condiciones bajo el mapa.", "et les conditions sous la carte.", "und die Bedingungen unter der Karte."],
    "I approve every request personally, usually within a day. Until then you can browse the public map.": ["Approvo personalmente ogni richiesta, di solito entro un giorno. Nel frattempo puoi guardare la mappa pubblica.", "Apruebo personalmente cada solicitud, normalmente en un día. Mientras tanto puedes ver el mapa público.", "J'approuve chaque demande personnellement, en général sous un jour. En attendant, vous pouvez parcourir la carte publique.", "Ich bestätige jede Anfrage persönlich, meist innerhalb eines Tages. Bis dahin kannst du die öffentliche Karte ansehen."],
    "Forgot your password?": ["Password dimenticata?", "¿Olvidaste la contraseña?", "Mot de passe oublié ?", "Passwort vergessen?"],
    "Contact me": ["Contattami", "Contáctame", "Contactez-moi", "Schreib mir"],
    "and I will reset it.": ["e la reimposto.", "y la restablezco.", "et je le réinitialise.", "und ich setze es zurück."],
    "← Back to the public map": ["← Torna alla mappa pubblica", "← Volver al mapa público", "← Retour à la carte publique", "← Zurück zur öffentlichen Karte"],
    "Please enter your first and last name.": ["Inserisci nome e cognome.", "Escribe tu nombre y apellidos.", "Indiquez votre prénom et votre nom.", "Bitte Vor- und Nachnamen eingeben."],
    "The password needs at least 8 characters.": ["La password deve avere almeno 8 caratteri.", "La contraseña necesita al menos 8 caracteres.", "Le mot de passe doit contenir au moins 8 caractères.", "Das Passwort braucht mindestens 8 Zeichen."],
    "Please accept the community code.": ["Accetta il codice della community.", "Acepta el código de la comunidad.", "Veuillez accepter le code de la communauté.", "Bitte akzeptiere den Community-Kodex."],
    "Sending your request…": ["Invio della richiesta…", "Enviando tu solicitud…", "Envoi de votre demande…", "Anfrage wird gesendet…"],
    "Almost done: check your inbox and click the link to confirm your email.": ["Quasi fatto: controlla la posta e clicca il link per confermare l'email.", "Casi listo: revisa tu correo y pulsa el enlace para confirmar tu email.", "Presque fini : vérifiez votre boîte mail et cliquez sur le lien de confirmation.", "Fast geschafft: Prüfe dein Postfach und klicke auf den Bestätigungslink."],
    "This email is already registered. Log in instead.": ["Questa email è già registrata. Accedi.", "Este email ya está registrado. Inicia sesión.", "Cet email est déjà inscrit. Connectez-vous.", "Diese E-Mail ist bereits registriert. Bitte anmelden."],
    "Sign-ups are closed right now. Please contact me.": ["Le iscrizioni sono chiuse in questo momento. Contattami.", "Las inscripciones están cerradas ahora. Contáctame.", "Les inscriptions sont fermées pour le moment. Contactez-moi.", "Anmeldungen sind gerade geschlossen. Schreib mir."],
    "Please choose a stronger password.": ["Scegli una password più robusta.", "Elige una contraseña más segura.", "Choisissez un mot de passe plus solide.", "Bitte wähle ein stärkeres Passwort."],
    "Please confirm your email first: check your inbox.": ["Prima conferma l'email: controlla la posta.", "Primero confirma tu email: revisa tu correo.", "Confirmez d'abord votre email : vérifiez votre boîte mail.", "Bitte bestätige zuerst deine E-Mail."],
    "Your request to join was not approved. If you think this is a mistake, contact me.": ["La tua richiesta di iscrizione non è stata approvata. Se pensi sia un errore, contattami.", "Tu solicitud no fue aprobada. Si crees que es un error, contáctame.", "Votre demande n'a pas été approuvée. Si vous pensez que c'est une erreur, contactez-moi.", "Deine Anfrage wurde nicht bestätigt. Wenn du denkst, das ist ein Fehler, schreib mir."],
    "Thanks for joining! Your request is waiting for my approval — usually within a day. Until then, here is the public map.": ["Grazie per esserti iscritto! La tua richiesta aspetta la mia approvazione — di solito entro un giorno. Intanto ecco la mappa pubblica.", "¡Gracias por unirte! Tu solicitud espera mi aprobación — normalmente en un día. Mientras tanto, aquí tienes el mapa público.", "Merci de votre inscription ! Votre demande attend mon approbation — en général sous un jour. En attendant, voici la carte publique.", "Danke fürs Beitreten! Deine Anfrage wartet auf meine Bestätigung — meist innerhalb eines Tages. Bis dahin hier die öffentliche Karte."],
    "Members see more.": ["I membri vedono di più.", "Los miembros ven más.", "Les membres en voient plus.", "Mitglieder sehen mehr."],
    "You'll see the exact location, photos, reviews and alerts as soon as your account is approved.": ["Vedrai posizione esatta, foto, recensioni e avvisi appena il tuo account sarà approvato.", "Verás la ubicación exacta, fotos, reseñas y avisos en cuanto se apruebe tu cuenta.", "Vous verrez la position exacte, les photos, avis et alertes dès que votre compte sera approuvé.", "Du siehst genaue Lage, Fotos, Bewertungen und Hinweise, sobald dein Account bestätigt ist."],
    "Members see more:": ["I membri vedono di più:", "Los miembros ven más:", "Les membres en voient plus :", "Mitglieder sehen mehr:"],
    "exact location and directions, photos, reviews, prices, live alerts and all the other spots nearby. Membership is free.": ["posizione esatta e indicazioni, foto, recensioni, prezzi, avvisi in tempo reale e tutti gli altri spot vicini. L'iscrizione è gratuita.", "ubicación exacta y cómo llegar, fotos, reseñas, precios, avisos en directo y todos los demás spots cercanos. Ser miembro es gratis.", "position exacte et itinéraire, photos, avis, prix, alertes en direct et tous les autres spots proches. L'adhésion est gratuite.", "genaue Lage und Route, Fotos, Bewertungen, Preise, Live-Hinweise und alle anderen Spots in der Nähe. Die Mitgliedschaft ist kostenlos."],
    "Photo spots, places to eat and stay, workshops and trails — collected over the years and shared by members. Membership is free: sign up in a minute, and I approve every account personally.": ["Spot fotografici, posti dove mangiare e dormire, workshop e sentieri — raccolti negli anni e condivisi dai membri. L'iscrizione è gratuita: ti registri in un minuto e approvo personalmente ogni account.", "Spots fotográficos, sitios para comer y dormir, talleres y rutas — reunidos durante años y compartidos por los miembros. Ser miembro es gratis: te registras en un minuto y apruebo cada cuenta personalmente.", "Spots photo, adresses pour manger et dormir, workshops et sentiers — rassemblés au fil des ans et partagés par les membres. L'adhésion est gratuite : inscription en une minute, et j'approuve chaque compte personnellement.", "Fotospots, Orte zum Essen und Schlafen, Workshops und Wege — über Jahre gesammelt und von Mitgliedern geteilt. Die Mitgliedschaft ist kostenlos: in einer Minute registriert, und ich bestätige jeden Account persönlich."],
    "How it works": ["Come funziona", "Cómo funciona", "Comment ça marche", "So funktioniert's"],
    "FIELD MANUAL": ["MANUALE DA CAMPO", "MANUAL DE CAMPO", "MANUEL DE TERRAIN", "FELDHANDBUCH"],
    "App & languages": ["App e lingue", "App e idiomas", "App et langues", "App & Sprachen"],
    "How Spots works": ["Come funziona Spots", "Cómo funciona Spots", "Comment marche Spots", "So funktioniert Spots"],
    "Visitors and members": ["Visitatori e membri", "Visitantes y miembros", "Visiteurs et membres", "Besucher und Mitglieder"],
    "Finding places": ["Trovare i posti", "Encontrar lugares", "Trouver des lieux", "Orte finden"],
    "Adding and updating": ["Aggiungere e aggiornare", "Añadir y actualizar", "Ajouter et mettre à jour", "Hinzufügen und aktualisieren"],
    "Categories": ["Categorie", "Categorías", "Catégories", "Kategorien"],
    "Signs on the map": ["Segni sulla mappa", "Señales en el mapa", "Signes sur la carte", "Zeichen auf der Karte"],
    "Put it on your home screen": ["Mettilo nella schermata Home", "Ponlo en tu pantalla de inicio", "Sur votre écran d'accueil", "Auf den Home-Bildschirm"],
    "Your language": ["La tua lingua", "Tu idioma", "Votre langue", "Deine Sprache"],
    "Questions?": ["Domande?", "¿Preguntas?", "Des questions ?", "Fragen?"],
    "Install the app": ["Installa l'app", "Instala la app", "Installer l'app", "App installieren"],
    "Install": ["Installa", "Instalar", "Installer", "Installieren"],
    "Fabio Costa Ph on your home screen: full screen, quicker, and Tools work offline.": ["Fabio Costa Ph sulla schermata Home: a tutto schermo, più veloce, e i Tools funzionano anche offline.", "Fabio Costa Ph en tu pantalla de inicio: a pantalla completa, más rápido, y los Tools funcionan sin conexión.", "Fabio Costa Ph sur votre écran d'accueil : plein écran, plus rapide, et les Tools fonctionnent hors ligne.", "Fabio Costa Ph auf deinem Home-Bildschirm: Vollbild, schneller, und die Tools funktionieren offline."],
    "Tap": ["Tocca", "Toca", "Touchez", "Tippe auf"],
    "Share, then “Add to Home Screen”.": ["Condividi, poi “Aggiungi alla schermata Home”.", "Compartir y luego “Añadir a pantalla de inicio”.", "Partager, puis « Sur l'écran d'accueil ».", "Teilen, dann „Zum Home-Bildschirm“."],
    "{n} photographs": ["{n} fotografie", "{n} fotografías", "{n} photographies", "{n} Fotografien"],
    "1 photograph": ["1 fotografia", "1 fotografía", "1 photographie", "1 Fotografie"],
    "{n} of {total} spots": ["{n} di {total} spot", "{n} de {total} spots", "{n} sur {total} spots", "{n} von {total} Spots"],
    "{n} places": ["{n} luoghi", "{n} lugares", "{n} lieux", "{n} Orte"], "1 place": ["1 luogo", "1 lugar", "1 lieu", "1 Ort"],
    "LIC_INTRO": ["<strong>Tutte le mie fotografie sono disponibili in licenza</strong>, per uso editoriale e commerciale, e come <strong>stampe fine-art</strong>.", "<strong>Todas mis fotografías están disponibles con licencia</strong>, para uso editorial y comercial, y como <strong>copias fine-art</strong>.", "<strong>Toutes mes photographies sont disponibles sous licence</strong>, pour un usage éditorial et commercial, et en <strong>tirages d'art</strong>.", "<strong>Alle meine Fotografien sind lizenzierbar</strong>, für redaktionelle und kommerzielle Nutzung, und als <strong>Fine-Art-Prints</strong> erhältlich."],
    "LIC_WRITE": ["Per licenze e stampe scrivimi", "Para licencias y copias, escríbeme", "Pour les licences et tirages, écrivez-moi", "Für Lizenzen und Prints schreib mir"],
    " at ": [" a ", " a ", " à ", " an "], " or": [" o", " o", " ou", " oder"], " on ": [" su ", " en ", " sur ", " auf "],
    "GUEST_BANNER": ["<strong>Stai vedendo {n} di {total} spot</strong>, in posizione approssimativa. I membri vedono ogni spot con la posizione esatta, foto, recensioni, prezzi e avvisi in tempo reale — e possono aggiungerne di propri. <em>L'iscrizione è gratuita:</em> <a href=\"#join\">iscriviti in un minuto</a>.", "<strong>Estás viendo {n} de {total} spots</strong>, en posiciones aproximadas. Los miembros ven cada spot con su ubicación exacta, fotos, reseñas, precios y avisos en directo — y pueden añadir los suyos. <em>Ser miembro es gratis:</em> <a href=\"#join\">únete en un minuto</a>.", "<strong>Vous voyez {n} spots sur {total}</strong>, en positions approximatives. Les membres voient chaque spot avec sa position exacte, photos, avis, prix et alertes en direct — et peuvent ajouter les leurs. <em>L'adhésion est gratuite :</em> <a href=\"#join\">inscrivez-vous en une minute</a>.", "<strong>Du siehst {n} von {total} Spots</strong>, an ungefähren Positionen. Mitglieder sehen jeden Spot mit genauer Lage, Fotos, Bewertungen, Preisen und Live-Hinweisen — und können eigene hinzufügen. <em>Die Mitgliedschaft ist kostenlos:</em> <a href=\"#join\">in einer Minute beitreten</a>."]
  };

  const idx = ORDER.indexOf(lang);
  const map = new Map();
  if (idx >= 0) for (const [en, tr] of Object.entries(D)) if (tr[idx] && tr[idx] !== en) map.set(en, tr[idx]);

  /** traduce un testo dell'interfaccia (se non c'è nel dizionario resta in inglese) */
  const t = s => (idx < 0 ? s : map.get(s) ?? s);

  /* ---------- traduzione automatica della pagina ---------- */
  const SKIP = "script,style,textarea,input,select option[data-keep],.rich,#aboutTitle,#aboutQuote,#articleReader,.leaflet-tile-pane,.maplibregl-canvas-container,[data-no-i18n]";
  const ATTRS = ["aria-label", "placeholder", "title"];
  function trText(node) {
    const raw = node.nodeValue;
    if (!raw || raw.length > 400) return;
    const key = raw.trim();
    if (!key || !map.has(key)) return;
    const p = node.parentElement;
    if (p && p.closest(SKIP)) return;
    const out = raw.replace(key, map.get(key));
    if (out !== raw) node.nodeValue = out;   // solo se cambia: evita di rincorrere le proprie modifiche
  }
  function trAttrs(el) {
    for (const a of ATTRS) {
      const v = el.getAttribute?.(a);
      if (v && map.has(v.trim()) && map.get(v.trim()) !== v) el.setAttribute(a, map.get(v.trim()));
    }
  }
  function walk(root) {
    if (root.nodeType === 3) return trText(root);
    if (root.nodeType !== 1 || root.closest?.(SKIP)) return;
    trAttrs(root);
    root.querySelectorAll?.("[aria-label],[placeholder],[title]").forEach(trAttrs);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n; while ((n = tw.nextNode())) trText(n);
  }
  function start() {
    document.documentElement.lang = lang;
    buildPicker();
    if (idx < 0) return;
    walk(document.body);
    new MutationObserver(list => {
      for (const m of list) {
        if (m.type === "characterData") trText(m.target);
        else if (m.type === "attributes") trAttrs(m.target);
        else m.addedNodes.forEach(walk);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  /* ---------- selettore della lingua nell'intestazione ---------- */
  function buildPicker() {
    const host = document.querySelector(".header-actions");
    if (!host || document.getElementById("langSelect")) return;
    const wrap = document.createElement("label");
    wrap.className = "lang-pick";
    wrap.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/></svg>
      <span class="sr-only">${t("Language")}</span>
      <select id="langSelect" data-no-i18n>${Object.entries(LANGS).map(([k, v]) => `<option value="${k}"${k === lang ? " selected" : ""}>${k.toUpperCase()} · ${v}</option>`).join("")}</select>
      <span class="lang-code" aria-hidden="true">${lang.toUpperCase()}</span>`;
    host.prepend(wrap);
    wrap.querySelector("select").addEventListener("change", e => {
      try { localStorage.setItem(KEY, e.target.value); } catch {}
      window.fcTrack?.(`Language: ${e.target.value}`);
      location.reload();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  return { lang, locale: LOCALES[lang], t, langs: LANGS };
})();
window.I18N = I18N;
